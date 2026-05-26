const fs = require('fs');
const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const events = Array.isArray(data) ? data : (data.traceEvents || []);

let profileNodeMap = new Map();
let hitCounts = new Map();

for (const ev of events) {
  if (ev.name === 'Profile' && ev.args && ev.args.data && ev.args.data.profile) {
    const profile = ev.args.data.profile;
    for (const node of profile.nodes || []) {
      profileNodeMap.set(node.id, node.callFrame);
    }
  }
  if (ev.name === 'ProfileChunk' && ev.args && ev.args.data) {
    const chunk = ev.args.data.cpuProfile || ev.args.data;
    if (chunk.nodes) {
      for (const node of chunk.nodes) {
        profileNodeMap.set(node.id, node.callFrame);
      }
    }
    if (chunk.samples) {
      for (const sampleId of chunk.samples) {
        hitCounts.set(sampleId, (hitCounts.get(sampleId) || 0) + 1);
      }
    }
  }
}

const sortedHits = Array.from(hitCounts.entries()).sort((a, b) => b[1] - a[1]);
console.log("Top 10 hottest functions (by sample count):");
for (let i = 0; i < 20 && i < sortedHits.length; i++) {
  const [nodeId, hits] = sortedHits[i];
  const frame = profileNodeMap.get(nodeId);
  if (frame) {
    console.log(`${hits} samples - ${frame.functionName} (${frame.url}:${frame.lineNumber})`);
  } else {
    console.log(`${hits} samples - Unknown Node ID ${nodeId}`);
  }
}
