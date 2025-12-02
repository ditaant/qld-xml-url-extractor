const express = require("express");
const puppeteer = require("puppeteer");
const { downloadDocx } = require("./docxHandler");

const app = express();

// PDF fetch route
app.get("/pdf", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).send("Missing url parameter");
  }

  let browser;
  try {
    // Launch Puppeteer with safe args for Docker/Railway
    browser = await puppeteer.launch({
      headless: "new", // modern headless mode
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process",
      ],
    });

    const page = await browser.newPage();

    // Set a realistic User-Agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
    );
    const origin = new URL(url).origin;

    console.log("Navigating to homepage...");
    await page.goto(origin, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Try to detect WAF redirect
    try {
      await page.waitForRequest((r) => r.url().includes("/.azwaf/"), {
        timeout: 15000,
      });
      console.log("Detected WAF challenge request");
    } catch {
      console.warn("No explicit WAF redirect detected within timeout");
    }

    // Let JS settle
    await new Promise((resolve) => setTimeout(resolve, 8000));

    // Grab cookies
    const cookies = await page.cookies();
    console.log("Cookies received:", cookies);

    if (!cookies.length) {
      return res.status(500).send("No cookies set by WAF challenge");
    }

    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    console.log("Using cookie header:", cookieHeader);

    // Fetch the PDF inside the page context
    const pdfData = await page.evaluate(async (url, cookieHeader) => {
      const response = await fetch(url, {
        headers: {
          Cookie: cookieHeader,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Array.from(new Uint8Array(arrayBuffer));
    }, url, cookieHeader);

    if (!pdfData.length) {
      console.error("PDF data is empty");
      return res.status(500).send("PDF data is empty");
    }

    const buffer = Buffer.from(pdfData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=file.pdf");
    res.send(buffer);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("Error: " + err.message);
  } finally {
    if (browser) await browser.close();
  }
});

// DOCX fetch route
app.get("/docx", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).send("Missing url parameter");
  }

  try {
    const buffer = await downloadDocx(url);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", "inline; filename=document.docx");
    res.send(buffer);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("Error: " + err.message);
  }
});

// Railway or Docker will inject PORT automatically
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`PDF fetcher running on port ${PORT}`);
});
