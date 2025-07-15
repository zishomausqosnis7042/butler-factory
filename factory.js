import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';

// --- НАСТРОЙКИ ОПЕРАЦИИ ---
const TARGET_URL_MAIN = "https://butlerspb.ru";
const TARGET_URL_RENT = "https://butlerspb.ru/rent";
const TOPICS_FILE = 'topics.txt';
const POSTS_DIR = 'src/content/posts';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("Секретный ключ GEMINI_API_KEY не найден в GitHub Secrets!");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

const ANCHORS = [
    `узнайте больше об управлении на <a href="${TARGET_URL_RENT}">сайте ButlerSPB</a>`,
    `профессиональные услуги по управлению можно найти <a href="${TARGET_URL_RENT}">здесь</a>`,
    `как советуют эксперты из <a href="${TARGET_URL_MAIN}">ButlerSPB</a>`,
    `подробности на <a href="${TARGET_URL_RENT}">этой странице</a>`,
    `доверительное управление квартирой - <a href="${TARGET_URL_RENT}">отличное решение</a>`
];

function slugify(text) {
  const a = "àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/_,:;"
  const b = "aaaaaaaaaacccddeeeeeeeegghiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------"
  const p = new RegExp(a.split('').join('|'), 'g')
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(p, c => b.charAt(a.indexOf(c)))
    .replace(/&/g, '-and-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
}

async function generatePost(topic) {
    console.log(`[+] Генерирую статью на тему: ${topic}`);
    const planPrompt = `Создай детальный, экспертный план-структуру для статьи на тему "${topic}". Включи 3-4 основных раздела с подзаголовками H2 и несколько подпунктов для каждого.`;
    const planResult = await model.generateContent(planPrompt);
    const plan = planResult.response.text();

    const articlePrompt = `Напиши экспертную, полезную статью по этому плану:\n\n${plan}\n\nТема: "${topic}". Пиши без воды, структурированно, для владельцев недвижимости.`;
    const articleResult = await model.generateContent(articlePrompt);
    let articleText = articleResult.response.text();

    const paragraphs = articleText.split('\n\n');
    if (paragraphs.length > 2) {
        const randomIndex = Math.floor(Math.random() * (paragraphs.length - 2)) + 1;
        const randomAnchor = ANCHORS[Math.floor(Math.random() * ANCHORS.length)];
        paragraphs[randomIndex] += ` ${randomAnchor}`;
        articleText = paragraphs.join('\n\n');
    }
    
    const seoPrompt = `Для этой статьи:\n\n${articleText}\n\nСгенерируй JSON-объект со следующими полями: "title" (SEO-заголовок до 70 символов), "description" (мета-описание до 160 символов), "schema" (валидный JSON-LD schema.org для типа BlogPosting, включающий headline, description, image, author, publisher, datePublished). В поле image используй случайную картинку с unsplash.com по теме.`;
    const seoResult = await model.generateContent(seoPrompt);
    const seoData = JSON.parse(seoResult.response.text().replace(/```json/g, '').replace(/```/g, ''));

    const frontmatter = `---
title: "${seoData.title.replace(/"/g, '\\"')}"
description: "${seoData.description.replace(/"/g, '\\"')}"
pubDate: ${new Date().toISOString()}
schema: ${JSON.stringify(seoData.schema)}
---
`;
    return frontmatter + '\n' + articleText;
}

async function main() {
    try {
        await fs.mkdir(path.join('src', 'content', 'posts'), { recursive: true });
        const topics = (await fs.readFile(TOPICS_FILE, 'utf-8')).split('\n').filter(Boolean);
        const existingPosts = (await fs.readdir(path.join('src', 'content', 'posts'))).map(file => file.replace('.md', ''));

        const newTopics = topics.filter(topic => !existingPosts.includes(slugify(topic)));

        if (newTopics.length === 0) {
            console.log("Нет новых тем для генерации. Завод в режиме ожидания.");
            return;
        }

        for (const topic of newTopics.slice(0, 50)) { // Лимит на 50 статей за запуск
            const slug = slugify(topic);
            const fullContent = await generatePost(topic);
            await fs.writeFile(path.join('src', 'content', 'posts', `${slug}.md`), fullContent);
            console.log(`[✔] Статья "${topic}" успешно создана и сохранена.`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Пауза 2 секунды
        }
    } catch (error) {
        console.error("Ошибка в работе завода:", error);
    }
}

main();
