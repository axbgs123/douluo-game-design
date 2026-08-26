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
    const messages = body.messages ?? [];
    const prompt = JSON.stringify(messages);
    const userMessage = [...messages].reverse().find((message) => message?.role === "user")?.content;
    let playerInput = "等待一天";
    let fixedRuleResult = "行动按既定结果完成。";
    let sceneMoment = "这一天";
    try {
      const parsed = JSON.parse(userMessage ?? "{}");
      if (typeof parsed.playerInput === "string" && parsed.playerInput.trim()) playerInput = parsed.playerInput.trim();
      if (typeof parsed.fixedRuleResult === "string" && parsed.fixedRuleResult.trim()) fixedRuleResult = parsed.fixedRuleResult.trim();
      if (parsed.worldTime && typeof parsed.worldTime.day === "number") sceneMoment = `第${parsed.worldTime.day}日${typeof parsed.worldTime.time === "string" ? parsed.worldTime.time : ""}`;
    } catch {
      // Narration prompts are not required to contain the semantic payload.
    }
    const narrativeRuleResult = fixedRuleResult.replaceAll("玩家", "当事人").replaceAll("程序判定", "现场结果").replaceAll("固定结果", "既定结果").replaceAll("规则包", "现有记录");
    const accountableHistory = /旧世|档案|年表|历史权益|听证|旧址线索|当前产权/.test(playerInput);
    const accountableMedia = /媒体联盟|核验联盟|共享核验|优先议题|共同核验|修复计划|恢复复核|观察期核验|补充.*核验资源|第三家.*媒体|三方.*准入|退出.*联盟|联盟.*退出|替补.*(?:媒体|机构|成员|加入|准入|来源|记录)/.test(playerInput);
    const historyNarrative = /听证/.test(playerInput)
      ? `审理人把旧档和当代登记分开核对，听完异议才在裁定页落笔：${narrativeRuleResult}`
      : /重新投资|复建|重新经营/.test(playerInput)
        ? `他核过今天的租约、登记和启动款，为新主体签下第一份当代账目：${narrativeRuleResult}`
        : /提交|申请/.test(playerInput) && /主张|历史权益/.test(playerInput)
          ? `受理员逐页编号旧档、权属调查和送达材料，收下费用后签出回单：${narrativeRuleResult}`
          : `他沿着目录号查到保管记录，把档案年代、转交印记和独立证据逐项对齐：${narrativeRuleResult}`;
    const mediaNarrative = /登记.*退出.*联盟/.test(playerInput)
      ? `退出申请进入复核栏，旧报道责任继续留档，共享资源仍锁在联盟账内：${narrativeRuleResult}`
      : /批准.*退出.*联盟/.test(playerInput)
        ? `成员退出后转入历史责任栏，联盟因成员不足冻结共享资源：${narrativeRuleResult}`
      : /登记.*替补/.test(playerInput)
        ? `替补机构只进入候选栏，不继承旧责任，并等待编辑复核和独立调查：${narrativeRuleResult}`
      : /调查.*替补/.test(playerInput)
        ? `调查员独立核对替补机构的来源记录，候选资格仍等待复核：${narrativeRuleResult}`
      : /批准.*替补/.test(playerInput)
        ? `替补经分别复核后完成准入，旧成员历史责任不变，共享资源才解除冻结：${narrativeRuleResult}`
      : /登记.*第三家/.test(playerInput)
      ? `第三家机构只进入候选准入栏，责任编辑与来源边界另页登记：${narrativeRuleResult}`
      : /批准.*第三家|三方.*准入/.test(playerInput)
        ? `三名编辑分别复核调查编号后，第三家机构才进入正式成员表并交入核验资源：${narrativeRuleResult}`
        : /补充.*核验资源/.test(playerInput)
      ? `资源室核对耗尽后的新调查和双编辑复核，只补回一枚核验签：${narrativeRuleResult}`
      : /修复计划/.test(playerInput)
      ? `更正编号保留在修复页，两名编辑各自留下复核栏和独立调查清单：${narrativeRuleResult}`
      : /恢复复核/.test(playerInput)
        ? `两名编辑分别复核两项调查，只领取一份观察期临时核验资源：${narrativeRuleResult}`
        : /观察期核验/.test(playerInput)
          ? `两家分别签收观察期查证回函，达到信誉门槛后才恢复试运行：${narrativeRuleResult}`
          : /优先议题|优先核验/.test(playerInput)
      ? `两位编辑把候选议题重新排期，优先项和因人力不足延后的条目都留在公开板上：${narrativeRuleResult}`
      : /共同核验/.test(playerInput)
        ? `两家编辑分别签收同一份异地查证回函，没有共用标题或结论：${narrativeRuleResult}`
        : `两家机构把联盟提案、共享核验额度和各自责任逐栏写清后分别签字：${narrativeRuleResult}`;
    const content = prompt.includes("行动语义整理器")
      ? JSON.stringify({ ruleAction: playerInput })
      : JSON.stringify({
          narrative: accountableHistory || accountableMedia
            ? accountableHistory ? historyNarrative : mediaNarrative
            : /等待一天|在住处等待/.test(playerInput)
              ? "晨光沿着窗纸落进屋里，他把昨夜散乱的东西重新收好，在安静中等过了一天。院外偶尔传来脚步声，除此之外没有新的变故。"
              : `${sceneMoment}，他把“${playerInput}”落实到眼前的动作，没有替下一步作决定。做完以后，桌上的记录随之多了一页。`,
          suggestions: ["查看屋外的动静", "整理随身物品", "询问附近的住民"],
          memory: { summary: "他在住处平静地等过了一天。", openThreads: [], keyChoice: "", npcNotes: {}, chapterTitle: "初醒" },
        });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(completion(content));
  });
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`mock-deepseek:${port}\n`));

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
