// Builds the admin export files (report PDF + Excel, receipt PDF) in Node, without a browser, so
// they can be opened and checked. No server or DB needed: pass saved JSON.
//   node scripts/check-exports.mjs <report.json> <order.json> <outDir>
// report.json = a GET /reports/sales response; order.json = a GET /reports/receipt/:id response.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";
import { jsPDF } from "jspdf";

const [reportFile, orderFile, outDir] = process.argv.slice(2);
if (!reportFile || !orderFile || !outDir) {
  console.error("usage: node scripts/check-exports.mjs <report.json> <order.json> <outDir>");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

// Browser download -> file on disk. jsPDF's save() and the <a download> link are the only browser bits.
jsPDF.API.save = function (name) {
  fs.writeFileSync(path.join(outDir, name), Buffer.from(this.output("arraybuffer")));
  return this;
};
let pendingBlob = null;
globalThis.URL.createObjectURL = (blob) => { pendingBlob = blob; return "blob:x"; };
globalThis.URL.revokeObjectURL = () => {};
globalThis.document = {
  body: { appendChild() {} },
  createElement: () => ({
    click() {
      const name = this.download;
      pendingBlob.arrayBuffer().then((buf) => fs.writeFileSync(path.join(outDir, name), Buffer.from(buf)));
    },
    remove() {},
  }),
};

const { downloadReportPdf, downloadReportXlsx, downloadReceiptPdf } = await import("../src/Admin/utils/exportFiles.js");

const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
const order = JSON.parse(fs.readFileSync(orderFile, "utf8"));

await downloadReportPdf(report, { generatedBy: "Check Script" });
await downloadReportXlsx(report, { generatedBy: "Check Script" });
await downloadReceiptPdf(order, { number: String(order._id).slice(-8).toUpperCase(), status: "Processing", method: "Cash on Delivery", payStatus: "Pending" });

// Same report with made-up costs, to exercise the profit / loss paths (test data only, not saved anywhere).
const withCost = structuredClone(report);
withCost.series = withCost.series.map((r, i) => (r.revenue ? { ...r, cost: Math.round(r.revenue * (i % 2 ? 1.1 : 0.7)), profit: Math.round(r.revenue * (i % 2 ? -0.1 : 0.3)), profitCoverage: 1 } : r));
withCost.totals = { ...withCost.totals, cost: withCost.series.reduce((s, r) => s + (r.cost || 0), 0), profitCoverage: 0.8 };
withCost.totals.profit = withCost.series.reduce((s, r) => s + (r.profit || 0), 0);
withCost.totals.margin = withCost.totals.profit / withCost.totals.revenue;
withCost.from = withCost.from; // same file name would overwrite: tag it
const origSave = jsPDF.API.save;
jsPDF.API.save = function (name) { return origSave.call(this, name.replace(".pdf", "_with-profit.pdf")); };
await downloadReportPdf(withCost, { generatedBy: "Check Script" });

await new Promise((r) => setTimeout(r, 300)); // let the xlsx write finish
const files = fs.readdirSync(outDir);
for (const f of files) {
  const buf = fs.readFileSync(path.join(outDir, f));
  if (f.endsWith(".pdf")) assert.strictEqual(buf.subarray(0, 5).toString(), "%PDF-", `${f} is a PDF`);
  if (f.endsWith(".xlsx")) assert.strictEqual(buf.subarray(0, 2).toString(), "PK", `${f} is a zip (xlsx)`);
  console.log("OK", f, `${Math.round(buf.length / 1024)} KB`);
}
