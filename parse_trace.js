const fs = require('fs');

const file = process.argv[2];
console.log(`Parsing ${file}...`);
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

// Traces can be an array or an object with a traceEvents array
const events = Array.isArray(data) ? data : (data.traceEvents || []);

const durations = [];
for (const ev of events) {
  if (ev.ph === 'X' && ev.dur) {
    durations.push(ev);
  }
}

durations.sort((a, b) => b.dur - a.dur);

console.log("Top 20 longest events:");
for (let i = 0; i < 20 && i < durations.length; i++) {
  const ev = durations[i];
  console.log(`${(ev.dur / 1000).toFixed(2)}ms - ${ev.name} (cat: ${ev.cat})`);
  if (ev.args && Object.keys(ev.args).length > 0) {
     console.log(`  args: ${JSON.stringify(ev.args).substring(0, 150)}`);
  }
}
