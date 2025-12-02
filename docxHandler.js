const puppeteer = require("puppeteer");

async function downloadDocx(url) {
  if (!url) throw new Error("Missing url parameter");

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    const origin = new URL(url).origin;

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
    );

    console.log("Navigating to page...");
    await page.goto(origin, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait for any WAF JS challenge
    try {
      await page.waitForRequest((r) => r.url().includes("/.azwaf/"), {
        timeout: 15000,
      });
      console.log("Detected WAF challenge request");
    } catch {
      console.warn("No explicit WAF redirect detected within timeout");
    }

    await new Promise((resolve) => setTimeout(resolve, 8000));

    const cookies = await page.cookies();
    if (!cookies.length) throw new Error("No cookies set by WAF challenge");

    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    console.log("Using cookie header:", cookieHeader);

    // Fetch DOCX inside page context
    const response = await page.evaluate(async (url, cookieHeader) => {
      const res = await fetch(url, {
        headers: {
          Cookie: cookieHeader,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const buffer = await res.arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    }, url, cookieHeader);

    if (!response.length) throw new Error("DOCX data is empty");

    return Buffer.from(response);
  } catch (err) {
    console.error("Error downloading DOCX:", err);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { downloadDocx };
