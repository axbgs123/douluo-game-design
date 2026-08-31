import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const books = [
  { id: "1043260558", route: "无系统·独立武魂路线" },
  { id: "1044332490", route: "无系统·邪魂师与魂骨路线" },
  { id: "1046092009", route: "水系武魂·超限成长路线" },
  { id: "1049667418", route: "系统·外附魂骨与势力反应路线" },
];
const root = resolve("source-materials/fanfic-samples");
const rawDirectory = resolve(root, "raw");
const textDirectory = resolve(root, "extracted");
await mkdir(rawDirectory, { recursive: true });
await mkdir(textDirectory, { recursive: true });

async function get(url) {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (iPhone; Codex research; public free chapters only)" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

function pageContext(html) {
  const match = html.match(/<script id="vite-plugin-ssr_pageContext" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("missing public page context");
  return JSON.parse(match[1]).pageContext;
}

function plainText(content) {
  return String(content ?? "")
    .replaceAll("<p>", "\n")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"').replaceAll("&#39;", "'")
    .replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

const manifest = [];
for (const book of books) {
  const bookUrl = `https://m.qidian.com/book/${book.id}.html`;
  const bookHtml = await get(bookUrl);
  await writeFile(resolve(rawDirectory, `qidian-mobile-${book.id}.html`), bookHtml);
  const firstId = Number(bookHtml.match(/"firstChapterId":(\d+)/)?.[1] ?? 0);
  if (!firstId) throw new Error(`missing first chapter for ${book.id}`);
  let chapterId = firstId;
  const chapters = [];
  for (let index = 0; index < 6 && chapterId; index += 1) {
    const url = `https://m.qidian.com/chapter/${book.id}/${chapterId}/`;
    const html = await get(url);
    const context = pageContext(html);
    const info = context.pageProps?.pageData?.chapterInfo;
    if (!info) throw new Error(`missing chapter data ${book.id}/${chapterId}`);
    if (Number(info.vipStatus ?? 0) > 0 && Number(info.freeStatus ?? 0) === 0) break;
    await writeFile(resolve(rawDirectory, `qidian-${book.id}-chapter-${chapterId}.html`), html);
    const text = plainText(info.content);
    const file = `qidian-${book.id}-${String(index + 1).padStart(2, "0")}-${chapterId}.txt`;
    await writeFile(resolve(textDirectory, file), `${info.chapterName}\n\n${text}\n`);
    chapters.push({ id: chapterId, title: info.chapterName, words: Number(info.actualWords ?? info.wordsCount ?? 0), file, url, free: true });
    chapterId = Number(info.next ?? 0);
  }
  const context = pageContext(bookHtml);
  const info = context.pageProps?.pageData?.bookInfo ?? {};
  manifest.push({ id: book.id, name: info.bookName, author: info.authorName, route: book.route, officialUrl: bookUrl, access: "起点官方公开免费章节", chapters });
}
await writeFile(resolve(root, "manifest.json"), `${JSON.stringify({ downloadedAt: new Date().toISOString(), policy: "只抓官方公开免费章节；VIP立即停止；原文目录被Git忽略", books: manifest }, null, 2)}\n`);
console.log(JSON.stringify({ books: manifest.length, chapters: manifest.reduce((sum, book) => sum + book.chapters.length, 0), root }, null, 2));
