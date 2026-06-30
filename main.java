import java.net.URI;
import java.net.http.*;
import java.util.*;

class main{
    static String apiKey = System.getenv("OPENROUTER_API_KEY");
    static HttpClient client = HttpClient.newHttpClient();

    public static void main(String []r)throws Exception{
        System.out.println("hellow world");

        Scanner input = new Scanner(System.in);
        System.out.println("Enter your Querry");

        String userQuery = input.nextLine();
        String plan = plannerResponse(userQuery);
        System.out.println("Planner picked topic: " + plan);
        //using the AI o/p as input for next step

        String[] tools = plan.split(",");
        StringBuilder gatheredContext = new StringBuilder();
        //next is using the response:

        for (String tool : tools) {
            tool = tool.trim();
            System.out.println("Running tool: " + tool);
        
            if (tool.equals("wikipediaAgent")) {
                String summary = fetchWikipediaSummary(userQuery);
                gatheredContext.append("Wikipedia: ").append(summary).append("\n");
            } else if (tool.equals("redditAgent")) {
                String summary = fakeRedditAgent(userQuery);
                gatheredContext.append("Reddit: ").append(summary).append("\n");
            } else {
                System.out.println("Tool not implemented yet: " + tool);
            }
        }
        
        System.out.println("\nGathered context:\n" + gatheredContext);
       
        

    }
    public static String plannerResponse(String userQuery)throws Exception{
        String response = "";
        String instructions = "You are a planner. You have access to these tools:\n" +
                                "1. wikipediaAgent - looks up factual/encyclopedic info (history, science, definitions, people, places)\n" +
                                "2. redditAgent - looks up opinions, discussions, sentiment (e.g. how people feel about stocks, products, trends)\n" +
                                "Given the user question below, decide which tool(s) are needed, in the order they should run.\n" +
                                "Reply with ONLY a comma-separated list of tool names, nothing else, no explanation.\n" +
                                "Example reply format: wikipediaAgent,redditAgent\n" +
                                "Question: ";
    
        response = callModel(instructions+userQuery);
        System.out.println("PLAN IS :"+response);
        return response.trim();
    }

    public static String callModel(String respondUser) throws Exception {
        String escaped = respondUser.replace("\"", "\\\"").replace("\n", "\\n");
        String jsonBody = "{"
                            + "\"model\":\"openai/gpt-4o\","
                            + "\"max_tokens\":50,"
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
        return body.substring(start, end);
    }

    //agent wiki:
    public static String fetchWikipediaSummary(String userQuery){
        return "fake response wiki";
    }
    //agent reddit:
    public static String fakeRedditAgent(String userQuery){
        return "fake response wiki";
    }
     //agent code agent:
    public static String codeAgent(String userQuery){
        return "fake response code";
    }
}