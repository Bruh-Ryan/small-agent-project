import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

class wikipediaAgent{
    static String apiKey = System.getenv("OPENROUTER_API_KEY");
    static HttpClient client = HttpClient.newHttpClient();
    static String searchTitle ="";
    static String questions="";
    static String tokenLine = "600"; // safe default for tokens to send inn
    static int definedTimer = 5;
    record WikipediaResult(String resolvedTitle, String summary) {}

    public static void main(String []r)throws Exception{
        if (apiKey == null || apiKey.isBlank()) {
            System.out.println("Missing OPENROUTER_API_KEY");
            return;
        }
        String userQuery = r.length > 0 ? String.join(" ", r) : "What is a quasar?";
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

        // System.out.println("\nToken budget: " + tokenBudget); //(debug)
        // System.out.println("Suggested searches: " + searchTitles);// (debug)

        // context gathered
        StringBuilder gatheredContext = new StringBuilder();

        // System.out.println("\nRunning tools: ");//(debug)

        List<String> termsToSearch = searchTitles.isEmpty()
                ? List.of(userQuery)   // fallback if the model gave nothing usable
                : searchTitles;
        

        int exSentences = tokenBudget >= 1000 ? 15 : (tokenBudget >= 500 ? 10 : 6);
        Set<String> seenTitles = new HashSet<>();
        for (String term : termsToSearch) {
            WikipediaResult result = fetchWikipediaSummary(term, exSentences);
            if (seenTitles.contains(result.resolvedTitle())) {
                continue;
            }
            seenTitles.add(result.resolvedTitle());
            gatheredContext.append("Wikipedia (").append(result.resolvedTitle()).append("): ")
                        .append(result.summary()).append("\n");
        }

        //context gathered.
        //System.out.println("\nGathered context:\n" + gatheredContext); //(debug)

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
    // function job is to assign TOKENS that would be used and also find a relevant search queries to go through wikipedia
    public static String plannerResponse(String userQuery) throws Exception {
        String response = "";
        String instructions = "You are a planner. You have access to these tools:\n" +
                                "1. wikipediaAgent - looks up factual/encyclopedic info (history, science, definitions, people, places)\n" +
                            
                                "Given the user question below, decide:\n" +
                                "1. Which tool(s) are needed, in order.\n" +
                                "2.How may tokens the final answer will likely need (simple factual = 100 ~ 500, detailed explaination = 500~1000, multi-topic = 1000~2000 <MAX TOKEN COUNT IS 2000>)\n"+
                                "3. Given this user query, output the best Wikipedia article title(s) to search for.\n"+
                                "Reply int EXACTLY this format, Nothing else:\n"+
                                "TOKENS: <single integer only, no ranges, no dashes - e.g 800>\n" +
                                "WIKIPEDIA_SEARCH_TITLE(s): <article title eg. query - 'I want to understand how black holes form, what happens at the event horizon and how Hawking radiation works, also who discovered them' then titles would be 'Black hole', 'Event horizon', 'Hawking radiation' or eg. 'what are persian cats', titles would be 'persian cats'>";
    
        response = callModel(instructions + userQuery, 100); // fixed 100 — just needs 2 short lines back
        // System.out.println("PLAN IS :" + response); //(debug)
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
    
        // OpenRouter (OpenAI-style) responses use "content" not "text"
        int start = body.indexOf("\"content\":\"") + 11;
        if (start < 11) {
            return "Could not parse response: " + body;
        }

        // DEBUG: Uncomment this to see the raw API JSON if it still truncates
        // System.out.println("RAW LLM BODY: " + body);

        StringBuilder resultBuilder = new StringBuilder();
        boolean inEscape = false;

        for (int i = start; i < body.length(); i++) {
            char c = body.charAt(i);
            
            if (inEscape) {
                // If the previous char was a backslash, append both and reset state
                resultBuilder.append('\\').append(c);
                inEscape = false;
            } else if (c == '\\') {
                // We hit a backslash, enter escape state for the next character
                inEscape = true;
            } else if (c == '"') {
                // We found the actual unescaped closing quote of the JSON field
                break;
            } else {
                resultBuilder.append(c);
            }
        }
        // System.out.println("RAW LLM BODY: " + body); //(debug)
        String result = resultBuilder.toString();

        // Safely unescape standard JSON sequences
        result = result.replace("\\n", "\n")
                    .replace("\\\"", "\"")
                    .replace("\\\\", "\\")
                    .replace("\\t", "\t")
                    .replace("\\r", "\r");
                    
        return result;
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

    // Holds the result of a Wikipedia lookup: "WikipediaResult"
    // - resolvedTitle: the CANONICAL title Wikipedia actually resolved to (handles redirects)
    // - summary: the extracted text content for that article
    public static WikipediaResult fetchWikipediaSummary(String searchQuery, int exSentences) throws Exception {

        // STEP 1: opensearch to get the exact Wikipedia page title
        String searchUrl = "https://en.wikipedia.org/w/api.php?action=opensearch&search="
                + URLEncoder.encode(searchQuery, StandardCharsets.UTF_8)
                + "&limit=1&format=json";
    
        HttpRequest searchReq = HttpRequest.newBuilder()
                .uri(URI.create(searchUrl))
                .header("User-Agent", "small-agent-project/1.0 (learning project)")
                .GET()
                .build();
    
        HttpResponse<String> searchRes = client.send(searchReq, HttpResponse.BodyHandlers.ofString());
        String searchBody = searchRes.body();
        // System.out.println("OpenSearch result: " + searchBody); //(debug)
        if (searchBody.contains(",[],")) {
            return new WikipediaResult(searchQuery, "No Wikipedia article found for: " + searchQuery);
        }
    
        int innerStart = searchBody.indexOf("[\"");
        innerStart = searchBody.indexOf("\"", innerStart + 1);
        innerStart = searchBody.indexOf("[", innerStart);
        int titleStart = searchBody.indexOf("\"", innerStart) + 1;
        int titleEnd = searchBody.indexOf("\"", titleStart);
        if (titleStart == 1 || titleEnd == -1) {
            return new WikipediaResult(searchQuery, "No search results found for: " + searchQuery);
        }
        String exactTitle = searchBody.substring(titleStart, titleEnd);
        //System.out.println("Exact Wikipedia title found: " + exactTitle);
    
        // STEP 2: fetch a deeper extract (not just the lead paragraph) via action=query
        String extractUrl = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts"
                + "&exsentences=" + exSentences
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
        //System.out.println("RAW BODY: " + body.substring(0, Math.min(500, body.length())));
    
        // resolved canonical title (handles redirects)
        String resolvedTitle = exactTitle;
        int titleKeyStart = body.indexOf("\"title\":\"");
        if (titleKeyStart != -1) {
            int titleValStart = titleKeyStart + 9;
            int titleValEnd = body.indexOf("\"", titleValStart);
            if (titleValEnd != -1) {
                resolvedTitle = body.substring(titleValStart, titleValEnd);
            }
        }
    
        int extStart = body.indexOf("\"extract\":");
        if (extStart == -1) return new WikipediaResult(resolvedTitle, "No extract found.");
        extStart = body.indexOf("\"", extStart + 10) + 1;
    
        StringBuilder extract = new StringBuilder();
        for (int i = extStart; i < body.length(); i++) {
            char c = body.charAt(i);
            if (c == '\\' && i + 1 < body.length() && body.charAt(i + 1) == '"') {
                extract.append('"');
                i++;
            } else if (c == '"') {
                break;
            } else {
                extract.append(c);
            }
        }
    
        return new WikipediaResult(resolvedTitle, extract.toString());
    }
}