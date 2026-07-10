import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;
import org.json.JSONArray;

class wikipediaAgent{
    static String apiKey = System.getenv("OPENROUTER_API_KEY");
    static HttpClient client = HttpClient.newHttpClient();
    static String searchTitle ="";
    static String questions="";
    static String tokenLine = "600";
    static int definedTimer = 5;
    record WikipediaResult(String resolvedTitle, String summary) {}

    public static void main(String []r)throws Exception{
        if (apiKey == null || apiKey.isBlank()) {
            System.out.println("Missing OPENROUTER_API_KEY");
            return;
        }
        String userQuery;
        if (r.length > 0) {
            userQuery = String.join(" ", r);
        } else {
            Scanner input = new Scanner(System.in);
            System.out.println("==================Enter your Query===================");
            userQuery = input.nextLine();
            System.out.println("======================================================");
        }
        searchBar(userQuery);
    }
    public static void searchBar(String userQuery) throws Exception {
        String plan = plannerResponse(userQuery);

        System.out.println("Plannning...");

        String tokenLine = "";
        List<String> searchTitles = new ArrayList<>();

        Pattern tokenPattern = Pattern.compile("^TOKENS:\\s*(.*)$", Pattern.CASE_INSENSITIVE);
        Pattern titlePattern = Pattern.compile("^WIKIPEDIA_SEARCH_TITLE(?:\\(S\\)|S)?:\\s*(.*)$", Pattern.CASE_INSENSITIVE);

        for (String line : plan.split("\n")) {
            line = line.trim();

            Matcher tm = tokenPattern.matcher(line);
            if (tm.matches()) {
                tokenLine = tm.group(1).trim();
                continue;
            }

            Matcher sm = titlePattern.matcher(line);
            if (sm.matches()) {
                searchTitles.addAll(parseTitles(sm.group(1).trim()));
            }
        }

        int tokenBudget = tokenLine.isEmpty()
                ? 500
                : Integer.parseInt(tokenLine.replaceAll("[^0-9]", ""));

        System.out.println("Suggested searches: " + searchTitles);

        // Build query terms from:
        // 1. Planner's guessed titles (already in searchTitles)
        // 2. Wikipedia search on the raw user query (discovery)
        Set<String> termsToSearch = new LinkedHashSet<>(searchTitles);

        // Discovery: search Wikipedia for the raw user query
        if (!searchTitles.contains(userQuery)) {
            List<String> discovered = searchWikipediaTitles(userQuery, 5);
            termsToSearch.addAll(discovered);
        }

        System.out.println("Final search terms: " + termsToSearch);

        StringBuilder gatheredContext = new StringBuilder();

        int exSentences = tokenBudget >= 1000 ? 50 : (tokenBudget >= 500 ? 35 : 25);
        Set<String> seenTitles = new HashSet<>();
        for (String term : termsToSearch) {
            WikipediaResult result;
            if (term.toLowerCase().startsWith("list of")) {
                result = fetchWikipediaWikitext(term);
                if (result.summary().isEmpty()) {
                    result = fetchWikipediaSummary(term, exSentences);
                }
            } else {
                result = fetchWikipediaSummary(term, exSentences);
            }
            if (seenTitles.contains(result.resolvedTitle())) {
                continue;
            }
            seenTitles.add(result.resolvedTitle());
            gatheredContext.append("Wikipedia (").append(result.resolvedTitle()).append("): ")
                        .append(result.summary()).append("\n");
            System.out.println("  [" + result.resolvedTitle() + ": " + result.summary().length() + " chars]");
        }

        System.out.println("\nGathered context:\n" + gatheredContext);

        String finalAnswer = answerWithContext(userQuery, gatheredContext.toString(), tokenBudget);
        System.out.println("\nFinal Answer:\n" + finalAnswer);
    }
    //used for parsing titles wiki title(s) 
    static List<String> parseTitles(String raw) {
        List<String> titles = new ArrayList<>();
        if (raw == null || raw.isBlank()) return titles;

        for (String part : raw.split(",")) {
            String t = part.trim();
            if ((t.startsWith("'") && t.endsWith("'")) ||
                (t.startsWith("\"") && t.endsWith("\""))) {
                t = t.substring(1, t.length() - 1).trim();
            }
            if (!t.isEmpty()) {
                titles.add(t);
            }
        }
        return titles;
    }
   public static String plannerResponse(String userQuery) throws Exception {
    String response = "";
    String instructions = "You are a planner. You have access to these tools:\n" +
                            "1. wikipediaAgent - looks up factual/encyclopedic info (history, science, definitions, people, places)\n" +
                        
                            "Given the user question below, decide:\n" +
                            "1. Which tool(s) are needed, in order.\n" +
                            "2.How may tokens the final answer will likely need (simple factual = 100 ~ 500, detailed explaination = 500~1000, multi-topic = 1000~2000 <MAX TOKEN COUNT IS 2000>)\n"+
                            "3. Given this user query, output the best Wikipedia article title(s) to search for.\n"+
                            "4. IMPORTANT: If the question asks about a CURRENT specific person holding a role " +
                            "(e.g. 'who is the current president', 'who is the current CEO of X', 'who currently leads Y'), " +
                            "search for the PERSON'S NAME first (your best guess of who currently holds that role), " +
                            "and list the general office/role article as a secondary backup title. " +
                             "Do NOT rely only on the general office/role article, since it usually describes the " +
                             "institution itself and may not clearly name the current holder.\n" +
                             "5. For 'who is the CURRENT [role]' questions, in addition to your best " +
                             "guess of the person's name, ALWAYS also include the corresponding " +
                             "'List of ___' Wikipedia article as a search title " +
                             "(e.g. 'List of presidents of the United States', 'List of CEOs of X'), " +
                             "since this list format reliably shows the most recent/current holder " +
                             "even if your guess of their name is outdated.\n" +
                            "Reply int EXACTLY this format, Nothing else:\n"+
                            "TOKENS: <single integer only, no ranges, no dashes - e.g 800>\n" +
                            "WIKIPEDIA_SEARCH_TITLE(s): <article title eg. query - 'I want to understand how black holes form, what happens at the event horizon and how Hawking radiation works, also who discovered them' then titles would be 'Black hole', 'Event horizon', 'Hawking radiation' or eg. 'what are persian cats', titles would be 'persian cats' or eg. 'who is the current president of the United States and when did they take office' then titles would be 'Donald Trump', 'President of the United States', 'List of presidents of the United States'>";

    response = callModel(instructions + userQuery, 100);
    System.out.println("PLAN IS :" + response);
    return response.trim();
}

    public static String callModel(String respondUser,int MAX_TOKENS) throws Exception {
        String escaped = respondUser.replace("\"", "\\\"").replace("\n", "\\n");
        String jsonBody = "{"
                            + "\"model\":\"openai/gpt-4o\","
                            + "\"max_tokens\":"+MAX_TOKENS+","
                            + "\"messages\":[{\"role\":\"user\",\"content\":\"" + escaped + "\"}]"
                            + "}";
        HttpRequest request = HttpRequest.newBuilder()
                                            .uri(URI.create("https://openrouter.ai/api/v1/chat/completions"))
                                            .header("Authorization", "Bearer " + apiKey)
                                            .header("Content-Type", "application/json")
                                            .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                                            .build();
    
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        String body = response.body();
    
        JSONObject json = new JSONObject(body);
        JSONArray choices = json.getJSONArray("choices");
        if (choices.isEmpty()) {
            return "Could not parse response: " + body;
        }
        String content = choices.getJSONObject(0)
                            .getJSONObject("message")
                            .getString("content");
        return content;
    }

    public static String answerWithContext(String question, String context, int tokenBudget) throws Exception {
        String instructions = "Using the following context, answer the user's question clearly.\n" +
                "Rules:\n" +
                "- Base all specific facts, numbers, names, and dates strictly on the context provided.\n" +
                "- You may use general reasoning or well-known background knowledge only to connect ideas or explain terms, " +
                "not to supply specific facts, figures, or dates that aren't in the context.\n" +
                "- If a specific fact needed to fully answer isn't in the context, say so explicitly " +
                "(e.g. 'the provided context doesn't specify X') rather than filling it in from memory.\n" +
                "Context:\n" + context + "\n" +
                "Question: " + question;
            return callModel(instructions, tokenBudget);
        }

    // Searches Wikipedia via list=search and returns up to `limit` real article titles.
    static List<String> searchWikipediaTitles(String query, int limit) throws Exception {
        List<String> titles = new ArrayList<>();
        String url = "https://en.wikipedia.org/w/api.php?action=query&list=search"
                + "&srsearch=" + URLEncoder.encode(query, StandardCharsets.UTF_8)
                + "&srlimit=" + limit
                + "&format=json";

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("User-Agent", "small-agent-project/1.0 (learning project)")
                .GET()
                .build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
        JSONObject json = new JSONObject(res.body());
        JSONArray results = json.getJSONObject("query").getJSONArray("search");
        for (int i = 0; i < results.length(); i++) {
            titles.add(results.getJSONObject(i).getString("title"));
        }
        return titles;
    }

    // Resolves a single search query to the exact Wikipedia page title.
    // Returns null if no article found.
    static String resolveWikipediaTitle(String searchQuery) throws Exception {
        List<String> titles = searchWikipediaTitles(searchQuery, 1);
        return titles.isEmpty() ? null : titles.get(0);
    }

    // Fetches the lead section as plain text (prose only, no tables).
    public static WikipediaResult fetchWikipediaSummary(String searchQuery, int exSentences) throws Exception {
        String exactTitle = resolveWikipediaTitle(searchQuery);
        if (exactTitle == null) {
            return new WikipediaResult(searchQuery, "No Wikipedia article found for: " + searchQuery);
        }
    
        String extractUrl = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts"
                + "&exintro=true&exchars=4000"
                + "&explaintext=true&redirects=1&titles="
                + URLEncoder.encode(exactTitle, StandardCharsets.UTF_8)
                + "&format=json";
    
        HttpRequest extractReq = HttpRequest.newBuilder()
                .uri(URI.create(extractUrl))
                .header("User-Agent", "small-agent-project/1.0 (learning project)")
                .GET()
                .build();
        HttpResponse<String> extractRes = client.send(extractReq, HttpResponse.BodyHandlers.ofString());
        String body = extractRes.body();
    
        JSONObject json = new JSONObject(body);
        JSONObject pages = json.getJSONObject("query").getJSONObject("pages");
    
        String resolvedTitle = exactTitle;
        String extract = "";
        for (String pageId : pages.keySet()) {
            JSONObject page = pages.getJSONObject(pageId);
            if (page.has("title")) {
                resolvedTitle = page.getString("title");
            }
            if (page.has("extract")) {
                extract = page.getString("extract");
            }
        }
    
        if (extract.isEmpty()) {
            return new WikipediaResult(resolvedTitle, "No extract found.");
        }
        return new WikipediaResult(resolvedTitle, extract);
    }

    // Converts a raw wikitext table (between {| and |}) into a pipe-delimited text format.
    static String formatWikiTable(String raw) {
        StringBuilder out = new StringBuilder();
        String[] rows = raw.split("\\n");
        for (String row : rows) {
            row = row.trim();
            if (row.startsWith("{|") || row.startsWith("|}") || row.startsWith("|-")) continue;
            if (row.startsWith("|") || row.startsWith("!")) {
                String rest = row.substring(1).trim();
                rest = rest.replaceAll("[a-zA-Z-]+\\s*=\\s*\"[^\"]*\"", "").trim();
                String[] cells = rest.split("\\|\\|");
                for (int c = 0; c < cells.length; c++) {
                    if (c > 0) out.append(" | ");
                    out.append(cells[c].trim());
                }
                out.append('\n');
            }
        }
        return out.toString().trim();
    }

    // Fetches the full page wikitext and extracts all tables as structured text.
    // Returns empty summary (not null) if no tables found — caller should fall back.
    public static WikipediaResult fetchWikipediaWikitext(String searchQuery) throws Exception {
        String exactTitle = resolveWikipediaTitle(searchQuery);
        if (exactTitle == null) {
            return new WikipediaResult(searchQuery, "No Wikipedia article found for: " + searchQuery);
        }

        String url = "https://en.wikipedia.org/w/api.php?action=parse&page="
                + URLEncoder.encode(exactTitle, StandardCharsets.UTF_8)
                + "&prop=wikitext&format=json";

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("User-Agent", "small-agent-project/1.0 (learning project)")
                .GET()
                .build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
        JSONObject json = new JSONObject(res.body());
        String wikitext = json.getJSONObject("parse")
                            .getJSONObject("wikitext")
                            .getString("*");

        StringBuilder result = new StringBuilder();
        int idx = 0;
        while (true) {
            int start = wikitext.indexOf("{|", idx);
            if (start == -1) break;
            int end = wikitext.indexOf("|}", start);
            if (end == -1) break;
            end += 2;
            String table = wikitext.substring(start, end);
            String formatted = formatWikiTable(table);
            if (!formatted.isEmpty()) {
                result.append(formatted).append("\n\n");
            }
            idx = end;
        }

        if (result.isEmpty()) {
            return new WikipediaResult(exactTitle, ""); // caller falls back
        }
        String text = result.toString();
        if (text.length() > 8000) text = text.substring(0, 8000) + "\n...[truncated]";
        return new WikipediaResult(exactTitle, text);
    }
}