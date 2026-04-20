require('dotenv').config();
const OpenAI = require('openai');

const client = new OpenAI({
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    apiKey: process.env.QWEN_API_KEY,
});

async function test() {
    const res = await client.chat.completions.create({
        model: "qwen-turbo",
        messages: [
            { role: "user", content: "Say hello" }
        ],
    });

    console.log(res.choices[0].message.content);
}

test();