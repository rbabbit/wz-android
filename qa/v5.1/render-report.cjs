'use strict';
const fs=require('node:fs'),path=require('node:path'),root=__dirname,a=JSON.parse(fs.readFileSync(path.join(root,'audit.json')));
const steps=[
 ['01-battle','Battle entry / late startup','Partial: header geometry captured; first wide image is transitional, not a stable reference'],
 ['02-build-sidebar','BUILD','Wrong interface: native sidebar rather than top choices'],
 ['03-design','Design overview','Crowded; compact weapon choice below initial view'],
 ['04-body-popup','Body picker','Grey native popup reproduced'],
 ['05-design-keyboard','Name field focus','Focus visible; software keyboard absent, occlusion unverified'],
 ['06-keyboard-dismissed','Back after name focus','Geometry retained; not proof of actual keyboard dismissal'],
 ['07-design-return','Return from Design','Battlefield and controls visible at both sizes'],
 ['08-factory','Factory overview','Crowded library hides native units below saved designs'],
 ['09-factory-popup','Factory picker','Same native popup mismatch'],
 ['10-production-queued','Initial production attempt','Rejected as proof: offscreen control was missed; superseded by edge check'],
 ['11-queue','Construction queue page','No actual queue rows: instructions only'],
 ['12-saved','Saved designs','Renders; large repeated cards and unsafe delete handler'],
 ['13-more','MORE','Redundant controls; removal remains required'],
 ['14-research','Research','Layout coherent at both sizes; retain design'],
 ['15-research-return','Return from Research','Battlefield and controls restored'],
 ['16-help','Help','Readable and scrollable; text references current sidebar/MORE and needs later updating'],
 ['17-final-battle','Return from Help','Battlefield and controls visible'],
 ['18-saved-produce-destination','Saved PRODUCE handoff','Selected design lost in Factory; edge capture only'],
 ['19-visible-template-queued','Visible native-template production','Actual accepted queue request; equivalent constructor cards duplicated'],
 ['20-populated-design','Edit populated design','Component values and validation visible; body/propulsion fallback art'],
 ['22-after-return-error','Edge return / replay','Final edge return interrupted by replay; not a passed return check']
];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let md='# Current interface audit — 4 November 2026\n\n'+a.scope+'.\n\nAPK SHA-256: `'+a.apkSHA256+'`. No app runtime source was modified and no new APK was built.\n\n[Visual report with screenshots](REPORT.html) · [Machine-readable findings](audit.json)\n\n';
md+='## Issues, before implementation\n\n'+a.findings.map(f=>`### ${f.id} · ${f.title}\n\n${f.priority} — ${f.kind}. ${f.detail}\n\nCode: \`${f.code}\`.\n\n![${f.id}: ${f.title}](${f.evidence})\n`).join('\n');
md+='\n## Steps and health\n\n| Step | Screen / interaction | Health | Evidence |\n| --- | --- | --- | --- |\n'+steps.map(([key,title,health],i)=>{const links=['before','compact'].filter(d=>fs.existsSync(path.join(root,d,key+'.png'))).map(d=>`[${d==='before'?'1280×800':'1080×600'}](${d}/${key}.png)`);return `| ${i+1} | ${title} | ${health} | ${links.join(' · ')} |`;}).join('\n');
md+='\n\n## Functional work before the visual redesign\n\n1. Preserve the chosen saved design through Factory navigation; clarify navigation versus production.\n2. Remove duplicate equivalent native templates and expose queue failures.\n3. Scope messages to the active screen and protect destructive library actions.\n4. Reproduce and consolidate header geometry, checking cold entry, replay, compact size and a genuinely visible keyboard.\n5. Then implement top-interface BUILD choices, simplified Design/Factory/Queue screens and removal of MORE, preserving Research.\n\n';
md+='## Accessibility observations\n\nFocus outlines are visible. Dense 30px-high toolbar controls, small helper copy, low-contrast disabled controls and content below the initial compact view need attention. No screen-reader or full contrast/compliance assessment was performed.\n\n## Evidence limits and diagnostics\n\n'+a.limits.map(s=>'- '+s).join('\n')+'\n';
fs.writeFileSync(path.join(root,'REPORT.md'),md);
let html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Warzone interface audit</title><style>body{margin:0;background:#0d151a;color:#e4ecee;font:16px/1.6 system-ui}main{max-width:1150px;margin:auto;padding:28px}h1,h2{line-height:1.2}section{padding:22px 0;border-top:1px solid #42545c}a{color:#88d6e0}img{display:block;width:100%;height:auto;border:1px solid #42545c;margin:16px 0}small{color:#a4b6bd}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #42545c;padding:8px;vertical-align:top}code{overflow-wrap:anywhere}</style><main><h1>Warzone interface audit</h1><p>4 November 2026 · Released v5.0 · 1280×800 and 1080×600 emulator viewports</p><p><strong>Audit first. No redesign or repaired APK is claimed.</strong> Findings distinguish confirmed screens, code risks and unresolved reports. Research is retained.</p><p><a href="REPORT.md">Detailed text report</a> · <a href="audit.json">Findings data</a></p><h2>Issues before implementation</h2>';
html+=a.findings.map(f=>`<section id="${f.id}"><h2>${esc(f.id)} · ${esc(f.title)}</h2><p><strong>${esc(f.priority)}</strong> · ${esc(f.kind)}</p><p>${esc(f.detail)}</p><small>Code: ${esc(f.code)}</small><a href="${f.evidence}"><img loading="lazy" src="${f.evidence}" alt="${esc(f.title)}"></a></section>`).join('');
html+='<section><h2>Steps and health</h2><table><thead><tr><th>Step</th><th>Interaction</th><th>Health</th><th>Screenshots</th></tr></thead><tbody>'+steps.map(([key,title,health],i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(title)+'</td><td>'+esc(health)+'</td><td>'+['before','compact'].filter(d=>fs.existsSync(path.join(root,d,key+'.png'))).map(d=>`<a href="${d}/${key}.png">${d==='before'?'1280×800':'1080×600'}</a>`).join(' / ')+'</td></tr>').join('')+'</tbody></table></section><section><h2>Limits and diagnostics</h2><ul>'+a.limits.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul></section></main></html>';
fs.writeFileSync(path.join(root,'REPORT.html'),html);
for(const f of a.findings)if(!fs.existsSync(path.join(root,f.evidence)))throw Error('Missing screenshot '+f.id);
console.log(`Rendered ${a.findings.length} findings and ${steps.length} flow steps; screenshot references verified`);
