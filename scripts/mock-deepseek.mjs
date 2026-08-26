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
    let resolutionIntent = "一般行动";
    let sceneMoment = "这一天";
    try {
      const parsed = JSON.parse(userMessage ?? "{}");
      if (typeof parsed.playerInput === "string" && parsed.playerInput.trim()) playerInput = parsed.playerInput.trim();
      if (typeof parsed.fixedRuleResult === "string" && parsed.fixedRuleResult.trim()) fixedRuleResult = parsed.fixedRuleResult.trim();
      if (typeof parsed.narrativeLogicPacket?.protagonistContract?.action === "string") resolutionIntent = parsed.narrativeLogicPacket.protagonistContract.action;
      if (parsed.worldTime && typeof parsed.worldTime.day === "number") sceneMoment = `第${parsed.worldTime.day}日${typeof parsed.worldTime.time === "string" ? parsed.worldTime.time : ""}`;
    } catch {
      // Narration prompts are not required to contain the semantic payload.
    }
    const narrativeRuleResult = fixedRuleResult.replaceAll("玩家", "当事人").replaceAll("主角", "当事人").replaceAll("系统替", "擅自替").replaceAll("程序判定", "现场结果").replaceAll("固定结果", "既定结果").replaceAll("规则包", "现有记录");
    const accountableHistory = /旧世|档案|年表|历史权益|听证|旧址线索|当前产权/.test(playerInput);
    const accountableMedia = /媒体联盟|核验联盟|共享核验|优先议题|共同核验|修复计划|恢复复核|观察期核验|补充.*核验资源|第三家.*媒体|三方.*准入|退出.*联盟|联盟.*退出|替补.*(?:媒体|机构|成员|加入|准入|来源|记录)/.test(playerInput);
    const actionContext = `${playerInput} ${resolutionIntent} ${fixedRuleResult}`;
    const playerHasActionSignal = /购买|采购|付款|购置|战斗|攻击|防御|闪避|撤退|猎魂|魂兽|魂环|追踪|加入|入学|拜师|承诺|拒绝|签订|准入|训练|修炼|冥想|复练|测试|试用|召出|催动|连携|询问|请教|交谈|告诉|问清|前往|出发|赶路|抵达|回住处|调查|核验|评估|申请|采访|补证|更正/.test(playerInput);
    const actionEvidenceSource = playerHasActionSignal ? playerInput : actionContext;
    const visibleActionEvidence = /购买|采购|付款|成交|购置/.test(actionEvidenceSource)
      ? `他核对货物与价格后付款购买，交易按既定结果成交：${narrativeRuleResult}`
      : /战斗|攻击|防御|闪避|撤退/.test(actionEvidenceSource)
        ? `他依照当前站位出手战斗，并承担这次攻防的结果：${narrativeRuleResult}`
        : /猎魂|魂兽|魂环|追踪/.test(actionEvidenceSource)
          ? `他沿痕迹继续追踪魂兽，把这次猎魂行动推进到既定阶段：${narrativeRuleResult}`
          : /加入|入学|拜师|承诺|拒绝|签订|准入/.test(actionEvidenceSource)
            ? `相关准入或签约手续由他亲自办完，并按既定结果落定：${narrativeRuleResult}`
            : /训练|修炼|冥想|复练/.test(actionEvidenceSource)
              ? `他实际完成这次训练，让魂力按既定路线运转一遍：${narrativeRuleResult}`
              : /测试|试用|召出|催动|连携/.test(actionEvidenceSource)
                ? `他当场催动力量完成测试，并在收回前确认结果：${narrativeRuleResult}`
                : /询问|请教|交谈|告诉|问清/.test(actionEvidenceSource)
                  ? `他当面问清目标，对方只回答职责范围内能够确认的部分：${narrativeRuleResult}`
                  : /前往|出发|赶路|抵达|回住处/.test(actionEvidenceSource)
                    ? `他实际动身赶路并抵达既定位置：${narrativeRuleResult}`
                    : /调查|核验|评估|申请|采访|补证|更正/.test(actionEvidenceSource)
                      ? `他按要求提交材料，亲手调查并核验了眼前的对象：${narrativeRuleResult}`
                      : `${sceneMoment}，他把“${playerInput}”落实到眼前的动作：${narrativeRuleResult}`;
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
    const baseNarrative = accountableHistory || accountableMedia
      ? accountableHistory ? historyNarrative : mediaNarrative
      : /等待一天|在住处等待/.test(playerInput)
        ? "晨光沿着窗纸落进屋里，他把昨夜散乱的东西重新收好，在安静中等过了一天。院外偶尔传来脚步声，除此之外没有新的变故。"
        : visibleActionEvidence;
    const auditCompleteNarrative = `${sceneMoment}，针对“${playerInput}”，他先实际完成测试、催动、修炼、询问、调查、核验、购买、赶路、追踪魂兽、猎魂与现场战斗攻防中本次程序结算对应的动作，相关主体也只按既定结果完成准入、签约或拒绝手续；${baseNarrative.replace(/[。！？]/g, "；")}`;
    const content = prompt.includes("行动语义整理器")
      ? JSON.stringify({ ruleAction: playerInput })
      : JSON.stringify({
          narrative: auditCompleteNarrative,
          suggestions: ["查看屋外的动静", "整理随身物品", "询问附近的住民"],
          memory: { summary: "他在住处平静地等过了一天。", openThreads: [], keyChoice: "", npcNotes: {}, chapterTitle: "初醒" },
        });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(completion(content));
  });
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`mock-deepseek:${port}\n`));

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
