/** File-input generator (triggered when the requirement mentions files / uploads). */

import { describeBytes } from "../requirement";
import { cap, rejected, succeeded, verifySteps, type Ctx, type Draft } from "./common";
import { uploadSteps } from "./values-limits";

export function fileCases(ctx: Ctx, depth: "quick" | "standard" | "exhaustive"): Draft[] {
  const { req } = ctx;
  const formats = req.lists.find((l) => l.kind === "format")?.values ?? ["PDF"];
  const f0 = formats[0].toLowerCase();
  const f1 = (formats[1] ?? formats[0]).toLowerCase();
  const maxSize = req.limits.find((l) => l.kind === "size")?.max;
  const E = cap(req.entity);
  const sample = `Sample_${E.replace(/\s+/g, "_")}.${f0}`;
  const ok = ctx.msg(["upload", "success"], `${E} uploaded successfully`);
  const typeMsg = ctx.msg(["format", "type"], `Only ${formats.join(", ")} files are allowed.`);
  const out: Draft[] = [
    {
      title: "Verify a file with a spoofed extension (content does not match) is rejected",
      category: "Security",
      type: "Negative",
      priority: "P1",
      automation: true,
      steps: uploadSteps(ctx, "each spoofed file from the test data, one at a time"),
      data: [`1. fake_${req.entity.replace(/\s+/g, "_")}.${f0} (actually setup.exe renamed)`, `2. photo_${req.entity.replace(/\s+/g, "_")}.${f1} (actually a JPG renamed)`, "Size: under 1 MB each"],
      expected: rejected(ctx, typeMsg, ["The server checks the file content (MIME / magic bytes), not just the extension."]),
      tags: ["negative", "security"],
    },
    {
      title: "Verify a file with a double extension is rejected",
      category: "Security",
      type: "Negative",
      priority: "P1",
      automation: true,
      steps: uploadSteps(ctx, "each file from the test data, one at a time"),
      data: [`1. ${req.entity.replace(/\s+/g, "_")}.${f0}.exe (1 MB)`, `2. ${req.entity.replace(/\s+/g, "_")}.${f1}.js (10 KB)`],
      expected: rejected(ctx, typeMsg),
      tags: ["negative", "security"],
    },
    {
      title: "Verify a file without any extension is rejected",
      category: "Validation",
      type: "Negative",
      priority: "P2",
      automation: true,
      steps: uploadSteps(ctx, "the file without an extension"),
      data: [`File name: ${E.replace(/\s+/g, "_")} (no extension)`, "Actual content: plain text", "Size: 10 KB"],
      expected: rejected(ctx, typeMsg),
      tags: ["negative", "validation"],
    },
    {
      title: "Verify file names with spaces, special and Unicode characters are accepted and displayed correctly",
      category: "Functional",
      type: "Positive",
      priority: "P2",
      automation: true,
      steps: uploadSteps(ctx, "each file from the test data, one at a time"),
      data: [`1. Sample User (QA) #1.${f0}`, `2. Résumé_Échantillon-Ñ.${f1}`, `3. नमूना_फ़ाइल.${f0}`, `4. Report & Notes @2026.${f0}`, "Size: under 1 MB each"],
      expected: succeeded(ctx, "Every file uploads without an error.", ok, "Each file name is shown exactly as uploaded (no garbled characters) and is still listed after a refresh.", ["Downloading a file returns the same name and content."]),
      tags: ["positive", "edge", "localisation"],
    },
    {
      title: "Verify a script or SQL payload in the file name is not executed",
      category: "Security",
      type: "Negative",
      priority: "P1",
      automation: true,
      steps: uploadSteps(ctx, "each file from the test data, one at a time"),
      data: [`1. <script>alert(1)</script>.${f0}`, `2. "><img src=x onerror=alert(1)>.${f0}`, `3. '; DROP TABLE files;--.${f0}`, "Size: 100 KB each"],
      expected: ["No script runs and no alert box appears.", "The file is rejected, or its name is sanitised / shown as plain text.", "No database error or stack trace is shown.", "The page renders normally after a refresh."],
      tags: ["negative", "security"],
    },
    {
      title: "Verify cancelling the file picker does not upload anything",
      category: "UI",
      type: "Negative",
      priority: "P3",
      automation: false,
      steps: [...ctx.open, `Click ${ctx.button(["upload", "browse"], "Upload button")}.`, "In the file picker, click 'Cancel' without selecting a file.", "Observe the upload section.", "Click the upload button again and close the picker with Esc.", ...verifySteps(ctx)],
      data: ["File: none selected"],
      expected: ["No upload starts and no error is shown.", `The ${ctx.area} is unchanged.`, "The upload button stays enabled.", "Nothing new is listed after a refresh."],
      tags: ["usability", "edge"],
    },
    {
      title: "Verify drag-and-drop of a valid file uploads it",
      category: "UI",
      type: "Positive",
      priority: "P2",
      automation: false,
      steps: [...ctx.open, "Open a file explorer window next to the browser.", `Drag '${sample}' onto the upload area.`, "Release the mouse button.", ...verifySteps(ctx)],
      data: [`File name: ${sample}`, `Size: ${describeBytes(Math.min(2 * 1024 ** 2, maxSize ?? 2 * 1024 ** 2))}`],
      expected: succeeded(ctx, "The drop area highlights while dragging, then the upload starts.", ok, `'${sample}' is listed and is still there after a refresh.`),
      tags: ["positive", "usability"],
    },
    {
      title: "Verify drag-and-drop of invalid files triggers the same validations",
      category: "UI",
      type: "Negative",
      priority: "P2",
      automation: false,
      steps: [...ctx.open, "Open a file explorer window next to the browser.", "Drag each invalid file from the test data onto the upload area, one at a time.", "Release the mouse button.", ...verifySteps(ctx)],
      data: ["1. photo.png (1 MB, wrong format)", ...(maxSize ? [`2. Large_${E.replace(/\s+/g, "_")}.${f0} (${describeBytes(maxSize * 2)}, too large)`] : [])],
      expected: rejected(ctx, `${typeMsg} (or the size message for the large file)`, [], false),
      tags: ["negative", "validation"],
    },
  ];

  if (depth !== "quick") {
    out.push(
      {
        title: "Verify a corrupted file is handled gracefully",
        category: "Reliability",
        type: "Negative",
        priority: "P2",
        automation: false,
        steps: uploadSteps(ctx, "each corrupted file from the test data, one at a time"),
        data: [`1. Corrupted_${E.replace(/\s+/g, "_")}.${f0} (truncated, 300 KB)`, `2. Corrupted_${E.replace(/\s+/g, "_")}.${f1} (invalid structure, 200 KB)`],
        expected: ["The upload is rejected, or accepted and flagged — as the requirement decides (confirm).", "If rejected, a clear message is shown: 'The file appears to be corrupted.'.", "No server error (500) or stack trace is shown.", "The page stays usable and nothing broken is listed after a refresh."],
        tags: ["negative", "reliability", "edge"],
      },
      {
        title: "Verify the behaviour for password-protected files",
        category: "Functional",
        type: "Negative",
        priority: "P3",
        automation: false,
        steps: uploadSteps(ctx, "each protected file from the test data, one at a time"),
        data: [`1. Protected_${E.replace(/\s+/g, "_")}.${f0} (password: Test@123, 500 KB)`, `2. Protected_${E.replace(/\s+/g, "_")}.${f1} (password: Test@123, 300 KB)`],
        expected: ["The file is rejected with a clear message, or accepted as an encrypted file — as the requirement decides (confirm).", "No server error occurs.", "If accepted, downloading returns the same protected file.", "The page stays usable after a refresh."],
        tags: ["negative", "edge"],
      },
      {
        title: "Verify a malware-infected test file is blocked",
        category: "Security",
        type: "Negative",
        priority: "P1",
        automation: true,
        steps: uploadSteps(ctx, "the EICAR test file"),
        data: [`File name: eicar_${req.entity.replace(/\s+/g, "_")}.txt`, "Content: EICAR standard antivirus test string", "Size: 68 bytes"],
        expected: rejected(ctx, ctx.msg(["virus", "malware", "unsafe"], "The file failed the security scan."), ["The file is quarantined / never stored and the event is logged."], false),
        tags: ["negative", "security"],
      },
      {
        title: "Verify the behaviour when multiple files are selected at once",
        category: "Functional",
        type: "Negative",
        priority: "P2",
        automation: true,
        steps: uploadSteps(ctx, "two valid files together (Ctrl / Cmd + click)"),
        data: [`1. Sample_A.${f0} (1 MB)`, `2. Sample_B.${f1} (1 MB)`],
        expected: ["Only one file is accepted with a clear message, or both are listed — as the requirement decides (confirm).", "No partial or half-uploaded file is left.", "The result is the same after a refresh.", "The upload button stays enabled for a retry."],
        tags: ["negative", "edge"],
      },
      {
        title: `Verify uploading a new file replaces the existing ${req.entity} file`,
        category: "Functional",
        type: "Positive",
        priority: "P2",
        automation: true,
        state: `The ${req.entity} already has 'Old_${E.replace(/\s+/g, "_")}.${f0}' attached.`,
        steps: uploadSteps(ctx, `'New_${E.replace(/\s+/g, "_")}.${f1}'`),
        data: [`Existing: Old_${E.replace(/\s+/g, "_")}.${f0} (1 MB)`, `New: New_${E.replace(/\s+/g, "_")}.${f1} (800 KB)`],
        expected: succeeded(ctx, "A replace confirmation is shown (if designed) and the new file uploads.", ok, "Only the new file is listed after a refresh; the old file is no longer downloadable.", ["The replacement is recorded in the activity log."]),
        tags: ["positive", "workflow"],
      },
      {
        title: `Verify an uploaded ${req.entity} file can be deleted`,
        category: "Functional",
        type: "Positive",
        priority: "P2",
        automation: true,
        state: `'${sample}' is attached.`,
        steps: [...ctx.open, `Click the delete (bin) icon next to '${sample}'.`, "Confirm the deletion in the dialog.", "Observe the upload section.", ...verifySteps(ctx)],
        data: [`Attached file: ${sample} (1 MB)`],
        expected: succeeded(ctx, "The file is removed from the list.", ctx.msg(["delete", "removed"], "File deleted"), "After a refresh the file is still gone and its download link returns 404.", ["The deletion is recorded in the activity log."]),
        tags: ["positive", "workflow"],
      },
      {
        title: "Verify an uploaded file can be downloaded / previewed and matches the original",
        category: "Data Integrity",
        type: "Positive",
        priority: "P2",
        automation: true,
        state: `'${sample}' is attached.`,
        steps: [...ctx.open, `Click the download icon next to '${sample}'.`, "Open the downloaded file.", "Compare its size and checksum (e.g. SHA-256) with the original.", "Open the preview (if available).", "Repeat for one file of every allowed format."],
        data: formats.map((f, i) => `${i + 1}. Sample_${E.replace(/\s+/g, "_")}.${f.toLowerCase()}`),
        expected: ["The download starts with the original file name.", "Size and checksum match the original exactly.", "The preview shows the right content.", "Unauthenticated access to the download URL is refused."],
        tags: ["positive", "regression"],
      },
      {
        title: "Verify very long file names are handled",
        category: "Boundary Value",
        type: "Negative",
        priority: "P3",
        automation: true,
        steps: uploadSteps(ctx, "each long-named file from the test data, one at a time"),
        data: [`1. A file name of 255 characters including '.${f0}'`, `2. A file name of 300 characters including '.${f0}' (create it on Linux / macOS)`, "Size: 500 KB each"],
        expected: ["The 255-character name is accepted (or truncated with the extension kept).", "The 300-character name is rejected with a clear message or safely truncated.", "No server error occurs and the layout doesn't break.", "The stored name is the same after a refresh."],
        tags: ["boundary", "edge"],
      },
    );
    ctx.assume(`Only one ${req.entity} file can be attached; a new upload replaces the existing one.`);
    ctx.assume("Antivirus scanning of uploads is in scope; corrupted and password-protected file behaviour is to be confirmed.");
  }
  return out;
}
