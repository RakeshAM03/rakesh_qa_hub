/** "Use in automation" code snippets for the generated file. */

const javaIdent = (s: string) => {
  const id = s.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(id) ? id : `_${id}`;
};

/** TestNG DataProvider reading the CSV export (header row on, comma-separated). */
export function javaTestNgSnippet(csvFile: string, columns: string[]): string {
  const cols = columns.slice(0, 4);
  const params = cols.map((c) => `String ${javaIdent(c)}`).join(", ");
  const use = cols.map((c) => javaIdent(c)).join(" + \" | \" + ");
  return `import com.opencsv.CSVReader;           // com.opencsv:opencsv
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.FileReader;
import java.util.Arrays;
import java.util.List;

public class GeneratedDataTest {

    @DataProvider(name = "generatedData")
    public Object[][] generatedData() throws Exception {
        try (CSVReader reader = new CSVReader(new FileReader("src/test/resources/${csvFile}"))) {
            List<String[]> rows = reader.readAll();
            List<String> header = Arrays.asList(rows.get(0));
            int[] idx = { ${cols.map((c) => `header.indexOf("${c.replace(/"/g, '\\"')}")`).join(", ")} };
            return rows.subList(1, rows.size()).stream()
                .map(r -> Arrays.stream(idx).mapToObj(i -> r[i]).toArray())
                .toArray(Object[][]::new);
        }
    }

    @Test(dataProvider = "generatedData")
    public void usesGeneratedRow(${params}) {
        // Replace with your test steps.
        System.out.println(${use || '""'});
    }
}
`;
}

/** Playwright test reading the JSON export (array of rows). */
export function playwrightSnippet(jsonFile: string, columns: string[]): string {
  const first = columns[0] ?? "id";
  const fields = columns.slice(0, 4).map((c) => `  ${/^[A-Za-z_$][\w$]*$/.test(c) ? c : JSON.stringify(c)}: string;`);
  return `import { test, expect } from "@playwright/test";
import rows from "./data/${jsonFile}"; // tsconfig: "resolveJsonModule": true

type Row = {
${fields.join("\n")}
};

for (const [i, row] of (rows as Row[]).entries()) {
  test(\`generated row \${i + 1}: \${row[${JSON.stringify(first)}]}\`, async ({ page }) => {
    // Replace with your test steps.
    await page.goto("/");
    expect(row[${JSON.stringify(first)}]).toBeDefined();
  });
}
`;
}
