class wikipediaAgentTest {
    static int passed = 0;
    static int failed = 0;

    public static void main(String[] args) {
        testParseTitlesSingle();
        testParseTitlesMultiple();
        testParseTitlesQuoted();
        testParseTitlesEmpty();
        testParseTitlesMixedQuotes();
        System.out.println(passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }

    static void testParseTitlesSingle() {
        var result = wikipediaAgent.parseTitles("Black hole");
        check(result.size() == 1 && result.get(0).equals("Black hole"),
              "single title");
    }

    static void testParseTitlesMultiple() {
        var result = wikipediaAgent.parseTitles("Black hole, Event horizon, Quasar");
        check(result.size() == 3 && result.get(1).equals("Event horizon"),
              "multiple titles");
    }

    static void testParseTitlesQuoted() {
        var result = wikipediaAgent.parseTitles("'Black hole', \"Event horizon\"");
        check(result.size() == 2
              && result.get(0).equals("Black hole")
              && result.get(1).equals("Event horizon"),
              "quoted titles have quotes stripped");
    }

    static void testParseTitlesEmpty() {
        var result = wikipediaAgent.parseTitles("");
        check(result.isEmpty(), "empty string yields empty list");
    }

    static void testParseTitlesMixedQuotes() {
        var result = wikipediaAgent.parseTitles("'one', two, \"three\"");
        check(result.size() == 3
              && result.get(0).equals("one")
              && result.get(1).equals("two")
              && result.get(2).equals("three"),
              "mixed quoted and unquoted");
    }

    static void check(boolean condition, String name) {
        if (condition) passed++;
        else { System.out.println("FAIL: " + name); failed++; }
    }
}
