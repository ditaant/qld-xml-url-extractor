const express = require("express");
const puppeteer = require("puppeteer");
const { downloadDocx } = require("./docxHandler");

const app = express();

app.get("/pdf", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).send("Missing url parameter");
  }

  let browser;
  try {
    // Launch Puppeteer with Docker-safe args
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
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

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
    );

    // Step 1: Visit site root
    console.log("Navigating to homepage...");
    await page.goto("https://parlinfo.aph.gov.au/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Step 2: Wait for WAF redirect
    try {
      await page.waitForRequest((r) => r.url().includes("/.azwaf/"), { timeout: 15000 });
      console.log("Detected WAF challenge request");
    } catch {
      console.warn("No explicit WAF redirect detected within timeout");
    }

    // Step 3: Let JS run
    await new Promise((resolve) => setTimeout(resolve, 8000));

    // Step 4: Grab cookies
    const cookies = await page.cookies();
    console.log("Cookies received from WAF:", cookies);

    if (!cookies.length) {
      return res.status(500).send("No cookies set by WAF challenge");
    }

    // Step 5: Build cookie header
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    console.log("Using cookie header:", cookieHeader);

    // Step 6: Fetch PDF inside the page context
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

    console.log("PDF data length:", pdfData.length);

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

// DOCX route
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

const PORT = process.env.PORT || 3176;
app.listen(PORT, () => {
  console.log(`PDF fetcher running on port ${PORT}`);
});
