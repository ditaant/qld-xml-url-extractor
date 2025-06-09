from flask import Flask, request, jsonify
import re

app = Flask(__name__)

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

@app.route('/')
def health():
    return "XML Extractor is alive!", 200
if __name__ == '__main__':
    app.run(host="0.0.0.0", port=10000)
