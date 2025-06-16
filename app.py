from flask import Flask, request, jsonify
from playwright.sync_api import sync_playwright
import re

app = Flask(__name__)

@app.route('/')
def health():
    return "XML Extractor is alive!", 200


# ✅ EXISTING ENDPOINT
@app.route('/get-xml-url', methods=['POST'])
def get_xml_url():
    data = request.get_json()
    bill_url = data.get("bill_url", "")
    
    if not bill_url:
        return jsonify({"error": "Missing 'bill_url' in request"}), 400
    
    xml_url = bill_url.replace("html", "xml")
    
    if not xml_url.endswith(".xml"):
        xml_url = xml_url.split("?")[0]  # remove any trailing junk
    
    return jsonify({"xml_url": xml_url})


# ✅ NEW ENDPOINT
@app.route('/find-html-url', methods=['POST'])
def find_html_url():
    data = request.json
    print("📥 Received request:", data)

    year = data.get("year")
    bill_name = data.get("billName")

    if not year or not bill_name:
        print("❌ Missing inputs.")
        return jsonify({"error": "Missing year or billName"}), 400

    url = f"https://www.legislation.qld.gov.au/browse/bills#/bill/year/{year}/58"
    print("🌐 Navigating to:", url)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
            page = browser.new_page()
            page.goto(url, wait_until="networkidle")
            page.wait_for_selector("table", timeout=10000)
            print("✅ Table found on page.")

            html_url = page.eval_on_selector_all(
                "table tr",
                """(rows, billName) => {
                    for (let row of rows) {
                        const link = row.querySelector('a');
                        if (link && link.textContent.trim() === billName.trim()) {
                            return link.getAttribute('href');
                        }
                    }
                    return null;
                }""",
                bill_name
            )

            browser.close()

    except Exception as e:
        print("❌ Error occurred:", str(e))
        return jsonify({"error": "Failed to scrape page", "details": str(e)}), 500

    if html_url:
        print("✅ Match found:", html_url)
        return jsonify({"htmlUrl": html_url})
    else:
        print("❌ No matching bill found.")
        return jsonify({"error": "Bill not found"}), 404

