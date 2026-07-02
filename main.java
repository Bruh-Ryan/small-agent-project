import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

class main{
    static String apiKey = System.getenv("OPENROUTER_API_KEY");
    static HttpClient client = HttpClient.newHttpClient();
    static String searchTitle ="";
    static String questions="";
    static String tokenLine = "600"; // safe default for tokens to send inn
    static int definedTimer = 5;

    public static void main(String []r)throws Exception{

        System.out.println("WELCOME");
        long startTime = System.currentTimeMillis();
        long timeout = definedTimer*60*1000L;

        // while(true){
        //     if(System.currentTimeMillis()-startTime >=timeout){
        //         System.out.print("Turing off");
        //         break;
        //     }
        //     searchBar();
        // }
        searchBar();
       
    }
    public static void searchBar() throws Exception {

        Scanner input = new Scanner(System.in);
        System.out.println("==================Enter your Querry===================");
        String userQuery = input.nextLine();
        System.out.println("======================================================");
        String plan = plannerResponse(userQuery);

        System.out.println("Plannning using..." + plan);

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

        System.out.println("\nToken budget: " + tokenBudget);
        System.out.println("Suggested searches: " + searchTitles);

        // context gathered
        StringBuilder gatheredContext = new StringBuilder();

        System.out.println("\nRunning tools: ");

        List<String> termsToSearch = searchTitles.isEmpty()
                ? List.of(userQuery)   // fallback if the model gave nothing usable
                : searchTitles;

        for (String term : termsToSearch) {
            String summary = fetchWikipediaSummary(term);
            gatheredContext.append("Wikipedia (").append(term).append("): ")
                        .append(summary).append("\n");
        }

        //context gathered.
        System.out.println("\nGathered context:\n" + gatheredContext);

        String finalAnswer = answerWithContext(userQuery, gatheredContext.toString(), tokenBudget);
        System.out.println("\nFinal Answer:\n" + finalAnswer);
    }
    //used for parsing titles wiki title(s) 
    private static List<String> parseTitles(String raw) {
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
                                "2.How may tokens the final answer will likely need (simple factual = 100 to 500, detailed explaination = 500-1000, multi-topic = 1000-3000)\n"+
                                "3. Given this user query, output the best Wikipedia article title(s) to search for.\n"+
                                "Reply int EXACTLY this format, Nothing else:\n"+
                                "TOKENS: <single integer only, no ranges, no dashes - e.g 800>\n" +
                                "WIKIPEDIA_SEARCH_TITLE(s): <article title eg. query - 'I want to understand how black holes form, what happens at the event horizon and how Hawking radiation works, also who discovered them' then titles would be 'Black hole', 'Event horizon', 'Hawking radiation' or eg. 'what are persian cats', titles would be 'persian cats'>";
    
        response = callModel(instructions + userQuery, 100); // fixed 100 — just needs 2 short lines back
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
    
        // OpenRouter (OpenAI-style) responses use "content" not "text"
        int start = body.indexOf("\"content\":\"") + 11;
        int end = body.indexOf("\"", start);
        if (start < 11 || end == -1) return "Could not parse response: " + body;
        String result = body.substring(start, end);
        // unescape JSON escape sequences
        result = result.replace("\\n", "\n")
                    .replace("\\\"", "\"")
                    .replace("\\\\", "\\");
        return result;
    }

    public static String answerWithContext(String question, String context, int tokenBudget) throws Exception {
        String instructions = "Using the following context, answer the user's question clearly.\n" +
                              "Context:\n" + context + "\n" +
                              "Question: " + question;
        return callModel(instructions, tokenBudget);
    }

    //agent wiki:
    public static String fetchWikipediaSummary(String searchQuery) throws Exception {
 
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
        // ADD THIS guard for empty ["query",[],[],[]]:
        System.out.println("OpenSearch result: " + searchBody);
        if (searchBody.contains(",[],")) {
            return "No Wikipedia article found for: " + searchQuery;
        }
        
        System.out.println("OpenSearch result: " + searchBody);
 
        // opensearch returns: ["query",["Exact Title"],["description"],["url"]]
        // we need the first item inside the second array — the exact title
        int innerStart = searchBody.indexOf("[\"");           // find start of query
        innerStart = searchBody.indexOf("\"", innerStart + 1); // skip past opening quote of query string
        innerStart = searchBody.indexOf("[", innerStart);       // find the titles array [
        int titleStart = searchBody.indexOf("\"", innerStart) + 1; // first " inside titles array
        int titleEnd = searchBody.indexOf("\"", titleStart);
        if (titleStart == 1 || titleEnd == -1) return "No search results found for: " + searchQuery;
        String exactTitle = searchBody.substring(titleStart, titleEnd);
        System.out.println("Exact Wikipedia title found: " + exactTitle);
 
        // STEP 2: fetch the summary using the exact title
        String summaryUrl = "https://en.wikipedia.org/api/rest_v1/page/summary/"
        + exactTitle.replace(" ", "_");
 
        HttpRequest summaryReq = HttpRequest.newBuilder()
                .uri(URI.create(summaryUrl))
                .header("User-Agent", "small-agent-project/1.0 (learning project)")
                .GET()
                .build();
        HttpResponse<String> summaryRes = client.send(summaryReq, HttpResponse.BodyHandlers.ofString());
        String summaryBody = summaryRes.body();
        System.out.println("RAW BODY: " + summaryBody.substring(0, Math.min(500, summaryBody.length())));
 
        int extStart = summaryBody.indexOf("\"extract\":");
        if (extStart == -1) return "No extract found.";
        extStart = summaryBody.indexOf("\"", extStart + 10) + 1;
 
        StringBuilder extract = new StringBuilder();
        for (int i = extStart; i < summaryBody.length(); i++) {
            char c = summaryBody.charAt(i);
            if (c == '\\' && i + 1 < summaryBody.length() && summaryBody.charAt(i + 1) == '"') {
                extract.append('"');
                i++; // skip the escape char
            } else if (c == '"') {
                break; // end of extract
            } else {
                extract.append(c);
            }
        }
 
        return extract.toString();
    }

   
}