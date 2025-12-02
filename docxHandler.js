const puppeteer = require("puppeteer-core");
const chromium = require("chrome-aws-lambda");

async function downloadDocx(url) {
  if (!url) {
    throw new Error("Missing url parameter");
  }

  let browser;
  try {
    const browser = await chromium.puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });
    
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
    );

    // Step 1: Visit site root
    console.log("Navigating to homepage...");
    await page.goto("https://parlinfo.aph.gov.au/", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // Step 2: Wait for WAF JS challenge redirect (/.azwaf path)
    try {
      await page.waitForRequest(req =>
        req.url().includes("/.azwaf/"), { timeout: 15000 }
      );
      console.log("Detected WAF challenge request");
    } catch {
      console.warn("No explicit WAF redirect detected within timeout");
    }

    // Step 3: Wait a bit for JS to execute and cookies to be set
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Step 4: Get cookies
    const cookies = await page.cookies();
    console.log("Cookies received from WAF:", cookies);
    
    if (!cookies.length) {
      throw new Error("No cookies set by WAF challenge");
    }

    // Step 5: Fetch DOCX using fetch with cookies
    console.log("Attempting to fetch DOCX from:", url);
    
    // Build cookie header for fetch request
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
    console.log("Using cookie header:", cookieHeader);

    const response = await page.evaluate(async (url, cookieHeader) => {
      const response = await fetch(url, {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      return Array.from(new Uint8Array(arrayBuffer));
    }, url, cookieHeader);

    console.log("DOCX data length:", response.length);
    
    if (response.length === 0) {
      throw new Error("DOCX data is empty");
    }

    return Buffer.from(response);

  } catch (err) {
    console.error("Error downloading DOCX:", err);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { downloadDocx };