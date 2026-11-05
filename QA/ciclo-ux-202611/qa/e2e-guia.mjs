// QA · escenario (b) guía rápida desde el inicio: todos los pasos, imágenes, cierre (✕, Entendido, Escape),
// puntos, foco y 320×568. Uso: node QA/ciclo-ux-202611/qa/e2e-guia.mjs http://127.0.0.1:8831
import { launch, makeRecorder, newPlayer, overflowX, shot, sleep, smallTargets } from './lib.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:8831';
const { check, log, save, results } = makeRecorder('e2e-guia');
const browser = await launch();
const list = [];
try {
  for (const [w, h] of [[320, 568], [360, 640], [412, 915]]) {
    const p = await newPlayer(browser, base, { label: `inicio-${w}`, width: w, height: h });
    list.push(p);
    const page = p.page;
    await page.waitForSelector('#f-name');
    await sleep(500);
    check(`G0 ${w}×${h}: no se abre sola`, !(await page.$('.guide-overlay')));
    await page.fill('#f-name', 'Borrador');
    await page.click('[data-act="guide-open"]');
    await page.waitForSelector('.guide-overlay[data-guide-context="home"]');
    const focus0 = await page.evaluate(() => document.activeElement?.id);
    check(`G1 ${w}: al abrir, el foco va al título`, focus0 === 'guide-title', focus0);
    const total = await page.$$eval('.guide-dot', (d) => d.length);
    const seen = [];
    for (let i = 0; i < total; i++) {
      await page.waitForFunction(() => {
        const img = document.querySelector('.guide-img');
        return !img || (img.complete && img.naturalWidth > 0);
      }, null, { timeout: 10_000 }).catch(() => {});
      const info = await page.evaluate(() => {
        const img = document.querySelector('.guide-img');
        const panel = document.querySelector('.guide-panel').getBoundingClientRect();
        const nav = document.querySelector('.guide-nav').getBoundingClientRect();
        const close = document.querySelector('.guide-close').getBoundingClientRect();
        return {
          count: document.querySelector('.guide-count').textContent,
          title: document.querySelector('.guide-title').textContent,
          img: img?.getAttribute('src'),
          nat: img?.naturalWidth ?? 0,
          alt: img?.alt?.length ?? 0,
          fits: panel.top >= 0 && panel.bottom <= innerHeight + 1 && nav.bottom <= innerHeight + 1 && close.top >= 0,
          over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      seen.push(info);
      if (w === 320 && (i === 0 || i === total - 1)) await shot(p, `guia-${w}x${h}-paso${i + 1}`);
      if (i < total - 1) {
        await page.click('.guide-nav [data-act="guide-next"]');
        await page.waitForFunction((n) => document.querySelector('.guide-count')?.textContent.includes(`Paso ${n} de`), i + 2, { timeout: 5_000 }).catch(() => {});
      }
    }
    log(`pasos ${w}`, seen.map((s) => `${s.count}|${s.img}|nat=${s.nat}|fits=${s.fits}`));
    check(`G2 ${w}: ${total} pasos recorridos con «Siguiente»`, seen.length === 12 && seen.at(-1).count.includes('12 de 12'), seen.at(-1)?.count);
    check(`G3 ${w}: todas las imágenes cargan (naturalWidth>0) y tienen alt`, seen.every((s) => s.nat > 0 && s.alt > 10), seen.filter((s) => !(s.nat > 0)).map((s) => s.img));
    check(`G4 ${w}: panel, ✕ y botones dentro de la pantalla en todos los pasos; sin desbordamiento`, seen.every((s) => s.fits && s.over <= 0), seen.filter((s) => !s.fits || s.over > 0).map((s) => s.count));
    const small = await smallTargets(page, '.guide-overlay');
    check(`G5 ${w}: objetivos táctiles de la guía ≥ 44 px`, small.length === 0, small);
    // último paso: «Entendido» cierra
    const lastBtn = (await page.textContent('.guide-nav .guide-next')).trim();
    await page.click('.guide-nav .guide-next');
    await sleep(400);
    check(`G6 ${w}: «${lastBtn}» en el último paso cierra la guía`, lastBtn === 'Entendido' && !(await page.$('.guide-overlay')));
    check(`G7 ${w}: el borrador del formulario sigue igual tras la guía`, (await page.inputValue('#f-name')) === 'Borrador');
    // puntos y anterior
    await page.click('[data-act="guide-open"]');
    await page.click('.guide-dot[data-step="7"]');
    await sleep(400);
    const c8 = await page.textContent('.guide-count');
    await page.click('.guide-nav [data-act="guide-prev"]');
    await sleep(400);
    const c7 = await page.textContent('.guide-count');
    check(`G8 ${w}: puntos (ir al 8) y «Anterior» (al 7)`, c8.includes('8 de') && c7.includes('7 de'), { c8, c7 });
    const prevDisabled = await (async () => {
      await page.click('.guide-dot[data-step="0"]');
      await sleep(400);
      return page.$eval('[data-act="guide-prev"]', (b) => b.disabled);
    })();
    check(`G9 ${w}: «Anterior» deshabilitado en el paso 1`, prevDisabled);
    // trampa de foco con Tab
    let escaped = false;
    for (let k = 0; k < 20; k++) {
      await page.keyboard.press('Tab');
      if (!(await page.evaluate(() => Boolean(document.activeElement?.closest('.guide-overlay'))))) escaped = true;
    }
    check(`G10 ${w}: Tab no saca el foco del diálogo`, !escaped);
    await page.click('.guide-close');
    await sleep(400);
    check(`G11 ${w}: ✕ cierra`, !(await page.$('.guide-overlay')));
    await page.click('[data-act="guide-open"]');
    await page.keyboard.press('Escape');
    await sleep(300);
    check(`G12 ${w}: Escape cierra`, !(await page.$('.guide-overlay')));
    // modo elegido en el inicio → la guía de ese modo
    await page.click('label.mode.m-fox_hunt');
    await sleep(300);
    await page.click('[data-act="guide-open"]');
    await page.waitForSelector('.guide-overlay');
    const kick = await page.textContent('.guide-kicker');
    check(`G13 ${w}: con «Caza del zorro» elegido, la guía es la de ese modo`, /zorro/i.test(kick), kick);
    const roleAttrs = await page.$eval('.guide-overlay', (e) => ({ role: e.getAttribute('role'), modal: e.getAttribute('aria-modal'), lab: e.getAttribute('aria-labelledby') }));
    check(`G14 ${w}: role=dialog, aria-modal y aria-labelledby`, roleAttrs.role === 'dialog' && roleAttrs.modal === 'true' && roleAttrs.lab === 'guide-title', roleAttrs);
    await page.keyboard.press('Escape');
    const o = await overflowX(page);
    check(`G15 ${w}: inicio sin desbordamiento`, o.over <= 0, o);
  }
  // ¿la guía sigue sin abrirse sola en una segunda visita?
  const again = list[0];
  await again.page.reload();
  await again.page.waitForSelector('#f-name');
  await sleep(500);
  check('G16 tras recargar, la guía tampoco se abre sola', !(await again.page.$('.guide-overlay')));
} catch (e) {
  check('EXCEPCIÓN', false, e.stack?.split('\n').slice(0, 4).join(' | '));
  for (const p of list) await shot(p, `error-guia-${p.label}`);
} finally {
  for (const p of list) check(`D3 errores de consola (${p.label})`, p.errors.length === 0, p.errors);
  save();
  await browser.close();
}
void results;
