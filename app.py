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
    year = data.get("year")
    bill_name = data.get("billName")

    if not year or not bill_name:
        return jsonify({"error": "Missing year or billName"}), 400

    url = f"https://www.legislation.qld.gov.au/browse/bills#/bill/year/{year}/58"

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
            page = browser.new_page()
            page.goto(url, wait_until="networkidle")
            page.wait_for_selector("table")

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
        return jsonify({"error": "Failed to scrape page", "details": str(e)}), 500

    if html_url:
        return jsonify({"htmlUrl": html_url})
    else:
        return jsonify({"error": "Bill not found"}), 404


# ✅ Only one app.run at the end
if __name__ == '__main__':
    app.run(host="0.0.0.0", port=10000)

