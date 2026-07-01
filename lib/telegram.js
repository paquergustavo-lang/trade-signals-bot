export async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID nao configurados - pulando envio ao Telegram.');
    return { skipped: true };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram retornou erro:', data);
    }
    return data;
  } catch (err) {
    console.error('Falha ao enviar mensagem no Telegram:', err.message);
    return { error: err.message };
  }
}
