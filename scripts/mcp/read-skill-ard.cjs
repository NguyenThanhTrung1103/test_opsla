const fs = require('fs');
const tokenData = JSON.parse(fs.readFileSync('C:\\Users\\nguyen.thanh-trung9\\.gemini\\config\\ard-token.json', 'utf8'));
const token = tokenData.access_token;
const endpoint = tokenData.mcp_endpoint || 'https://mcp.arealisticdreamer.com/mcp';

async function readSkill() {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 6,
      method: 'resources/read',
      params: {
        uri: 'skill://ard/SKILL.md'
      }
    })
  });

  const text = await res.text();
  console.log('Read output:', text.slice(0, 1500));
}

readSkill().catch(err => console.error('Error:', err));
