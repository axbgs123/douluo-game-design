import { createServer } from "node:http";

const port = Number(process.env.MOCK_DEEPSEEK_PORT ?? 18999);

function completion(content) {
  return JSON.stringify({
    id: "e2e-completion",
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  });
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (request.method !== "POST" || request.url !== "/chat/completions") {
    response.writeHead(404).end();
    return;
  }

  let raw = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { raw += chunk; });
  request.on("end", () => {
    let body;
    try { body = JSON.parse(raw); }
    catch { response.writeHead(400).end(); return; }
    const prompt = JSON.stringify(body.messages ?? []);
    const content = prompt.includes("行动语义整理器")
      ? JSON.stringify({ ruleAction: "等待一天" })
      : JSON.stringify({
          narrative: "晨光沿着窗纸落进屋里，他把昨夜散乱的东西重新收好，在安静中等过了一天。院外偶尔传来脚步声，除此之外没有新的变故。",
          suggestions: ["查看屋外的动静", "整理随身物品", "询问附近的住民"],
          memory: { summary: "他在住处平静地等过了一天。", openThreads: [], keyChoice: "", npcNotes: {}, chapterTitle: "初醒" },
        });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(completion(content));
  });
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`mock-deepseek:${port}\n`));

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
