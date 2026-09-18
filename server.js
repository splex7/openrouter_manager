const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { randomUUID } = require("crypto");

function loadEnvFile(file = path.join(__dirname, ".env")) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

loadEnvFile();

const PORT = process.env.PORT || 8799;
const MANAGEMENT_KEY = process.env.OPENROUTER_MANAGEMENT_KEY || "";
const OPENROUTER_BASE = "https://openrouter.ai";
const PUBLIC_DIR = path.join(__dirname, "public");
const AUDIT_LOG_PATH = process.env.AUDIT_LOG_PATH || path.join(__dirname, "logs", "audit.jsonl");

function sendJson(res, status, data) { res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}); res.end(JSON.stringify(data)); }
function sendText(res,status,text,type="text/plain; charset=utf-8"){ res.writeHead(status,{"Content-Type":type}); res.end(text); }
async function readBody(req){ let body=""; for await(const chunk of req) body+=chunk; if(!body)return {}; return JSON.parse(body); }
function requireManagementKey(res){ if(!MANAGEMENT_KEY){sendJson(res,500,{error:"OPENROUTER_MANAGEMENT_KEY is not configured on the server."});return false;} return true; }
async function openRouter(pathname,options={}){ const response=await fetch(`${OPENROUTER_BASE}${pathname}`,{...options,headers:{Authorization:`Bearer ${MANAGEMENT_KEY}`,"Content-Type":"application/json",...(options.headers||{})}}); const text=await response.text(); let payload; try{payload=text?JSON.parse(text):{};}catch{payload={raw:text};} if(!response.ok){const err=new Error(payload?.error?.message||payload?.message||`OpenRouter ${response.status}`);err.status=response.status;err.payload=payload;throw err;} return payload; }
async function listAllKeys(includeDisabled=true,workspaceId=""){ const all=[]; for(let offset=0;offset<500;offset+=100){const qs=new URLSearchParams({include_disabled:includeDisabled?"true":"false",offset:String(offset)});if(workspaceId)qs.set("workspace_id",workspaceId);const payload=await openRouter(`/api/v1/keys?${qs}`);const rows=payload.data||[];all.push(...rows);if(rows.length<100)break;}return all; }
async function appendAudit(event){await fs.promises.mkdir(path.dirname(AUDIT_LOG_PATH),{recursive:true});await fs.promises.appendFile(AUDIT_LOG_PATH,`${JSON.stringify({at:new Date().toISOString(),...event})}\n`);}
async function auditAction(req,event,operation){const actor={ip:req.socket.remoteAddress||null};await appendAudit({outcome:"requested",...actor,...event});try{const result=await operation();await appendAudit({outcome:"succeeded",...actor,...event,keyHash:result?.data?.hash||event.keyHash||null});return result;}catch(error){await appendAudit({outcome:"failed",...actor,...event,error:error.message});throw error;}}
async function listAuditEvents(){try{const events=[];for(const line of (await fs.promises.readFile(AUDIT_LOG_PATH,"utf8")).split(/\r?\n/)){if(!line)continue;try{events.push(JSON.parse(line));}catch{}}return events;}catch(error){if(error.code==="ENOENT")return[];throw error;}}
async function listGroups(){const groups=new Map;for(const event of await listAuditEvents())if(event.action==="group.create"&&event.outcome==="succeeded")groups.set(event.groupId,{id:event.groupId,name:event.name,createdAt:event.at});return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));}
async function listKeyGroups(){const groups=new Map;for(const event of await listAuditEvents())if(event.action==="key.create"&&event.outcome==="succeeded"&&event.keyHash)groups.set(event.keyHash,event.groupId||"");return groups;}
async function handleApi(req,res,url){ if(!requireManagementKey(res))return; try{
if(req.method==="GET"&&url.pathname==="/api/keys"){const groups=await listKeyGroups();const keys=await listAllKeys(url.searchParams.get("include_disabled")!=="false",url.searchParams.get("workspace_id")||"");return sendJson(res,200,{data:keys.map(key=>({...key,groupId:groups.get(key.hash)||""}))});}
if(req.method==="GET"&&url.pathname==="/api/credits") return sendJson(res,200,await openRouter("/api/v1/credits"));
if(req.method==="GET"&&url.pathname==="/api/groups") return sendJson(res,200,{data:await listGroups()});
if(req.method==="POST"&&url.pathname==="/api/groups"){const body=await readBody(req);const name=String(body.name||"").trim();if(!name||name.length>100)return sendJson(res,400,{error:"group name must contain 1～100 characters."});if((await listGroups()).some(group=>group.name.toLowerCase()===name.toLowerCase()))return sendJson(res,409,{error:"A group with this name already exists."});const group={id:randomUUID(),name};await auditAction(req,{action:"group.create",groupId:group.id,name:group.name},async()=>({}));return sendJson(res,201,{data:group});}
if(req.method==="POST"&&url.pathname==="/api/keys/bulk"){const body=await readBody(req);const students=Array.isArray(body.students)?body.students:[];if(!students.length||students.length>150)return sendJson(res,400,{error:"students must contain 1～150 rows."});const weeklyLimit=Number(body.limit);if(!Number.isFinite(weeklyLimit)||weeklyLimit<0)return sendJson(res,400,{error:"limit must be a non-negative USD amount."});const groupId=String(body.group_id||"");if(groupId&&!(await listGroups()).some(group=>group.id===groupId))return sendJson(res,400,{error:"group was not found."});const results=[];for(const student of students){const name=[student.studentId,student.name,student.className,student.team].filter(Boolean).join(" - ").trim();try{const payload={name:name||"Student",limit:weeklyLimit,limit_reset:"weekly",include_byok_in_limit:Boolean(body.include_byok_in_limit)};if(body.expires_at)payload.expires_at=body.expires_at;if(body.workspace_id)payload.workspace_id=body.workspace_id;const created=await auditAction(req,{action:"key.create",studentId:student.studentId||"",name:student.name||"",className:student.className||"",team:student.team||"",groupId,limit:weeklyLimit,limitReset:"weekly"},()=>openRouter("/api/v1/keys",{method:"POST",body:JSON.stringify(payload)}));results.push({ok:true,studentId:student.studentId||"",name:student.name||"",className:student.className||"",team:student.team||"",groupId,key:created.key||"",hash:created.data?.hash||"",limit:created.data?.limit??"",limitReset:created.data?.limit_reset||""});}catch(error){results.push({ok:false,studentId:student.studentId||"",name:student.name||"",className:student.className||"",team:student.team||"",groupId,error:error.message});}}return sendJson(res,200,{data:results});}
const match=url.pathname.match(/^\/api\/keys\/([a-f0-9]+)$/i);if(match&&req.method==="PATCH"){const body=await readBody(req);const allowed={};for(const key of ["name","disabled","include_byok_in_limit","limit","limit_reset"])if(Object.prototype.hasOwnProperty.call(body,key))allowed[key]=body[key];const action=Object.prototype.hasOwnProperty.call(allowed,"disabled")?(allowed.disabled?"key.disable":"key.enable"):"key.update";return sendJson(res,200,await auditAction(req,{action,keyHash:match[1],changes:allowed},()=>openRouter(`/api/v1/keys/${match[1]}`,{method:"PATCH",body:JSON.stringify(allowed)})));}if(match&&req.method==="DELETE")return sendJson(res,200,await auditAction(req,{action:"key.delete",keyHash:match[1]},()=>openRouter(`/api/v1/keys/${match[1]}`,{method:"DELETE",body:"{}"})));sendJson(res,404,{error:"API route not found"});}catch(error){sendJson(res,error.status||500,{error:error.message,details:error.payload||undefined});}}
function serveStatic(req,res,url){let rel=url.pathname==="/"?"index.html":url.pathname.replace(/^\/+/,"");rel=path.normalize(rel).replace(/^(\.\.[/\\])+/,"");const file=path.join(PUBLIC_DIR,rel);if(!file.startsWith(PUBLIC_DIR))return sendText(res,403,"Forbidden");fs.readFile(file,(err,data)=>{if(err)return sendText(res,404,"Not found");const type={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8"}[path.extname(file).toLowerCase()]||"application/octet-stream";res.writeHead(200,{"Content-Type":type,"Cache-Control":"no-store"});res.end(data);});}
http.createServer(async(req,res)=>{const url=new URL(req.url,`http://${req.headers.host}`);if(url.pathname.startsWith("/api/"))return handleApi(req,res,url);return serveStatic(req,res,url);}).listen(PORT,()=>console.log(`OpenRouter Key Manager: http://localhost:${PORT}`));
