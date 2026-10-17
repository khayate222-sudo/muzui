import { expect, test } from '@playwright/test';

for (const width of [320, 390]) test(`station controls stay readable and usable at ${width}px`, async ({ browser }) => {
  const context = await browser.newContext({locale:'ja-JP',viewport:{width,height:844},isMobile:true,hasTouch:true});
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page.getByLabel('ニックネーム').fill('切符を持った旅人');
    await page.getByRole('button',{name:'WALKをはじめる',exact:true}).click();
    await expect(page.getByRole('button',{name:'WALKをはじめる',exact:true})).toHaveCount(0);
    await expect(page.locator('[role=application][data-ready=true]')).toBeVisible();
    await expect(page.locator('.toast')).toHaveCount(0);
    await page.getByLabel('箱庭の光').selectOption('afternoon');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
    const buttons=page.locator('.topbar > a, .topbar .notification, .mobile-world-actions button, .quick-discovery button, .world-path button, .world-gates button, .area-dock button, .mobile-nav button');
    const small=await buttons.evaluateAll(elements=>elements.filter(element=>{
      const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<43.9||r.height<43.9);
    }).map(element=>element.textContent?.trim()||element.getAttribute('aria-label')));
    expect(small).toEqual([]);
    // Check the rendered labels, including their inherited colours and the
    // selected surface, rather than assuming CSS variables reach every span.
    const contrast = await page.locator('.mobile-nav button > span:last-child, .area-dock button > span:last-child').evaluateAll(labels => {
      const rgb = (colour: string) => colour.match(/[\d.]+/g)!.slice(0,3).map(Number);
      const luminance = (values: number[]) => values.map(value => {const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
      return labels.map(label => {
        let surface: Element|null=label;
        while(surface&&getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)')surface=surface.parentElement;
        const foreground=luminance(rgb(getComputedStyle(label).color)), background=luminance(rgb(getComputedStyle(surface!).backgroundColor));
        return {label:label.textContent,ratio:(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)};
      }).filter(item=>item.ratio<4.5);
    });
    expect(contrast).toEqual([]);
    const map=await page.locator('canvas').boundingBox(), nav=await page.locator('.mobile-nav').boundingBox();
    expect(map!.height).toBeGreaterThan(240);
    expect(map!.y+map!.height).toBeLessThanOrEqual(nav!.y);
    await page.screenshot({animations:'disabled',path:`artifacts/station-chrome-${width}.png`});

    await page.locator('.mobile-nav').getByRole('button',{name:'探す',exact:true}).tap();
    await expect(page.getByRole('dialog').getByLabel('投稿を絞り込む')).toBeVisible();
    await page.getByRole('button',{name:'閉じる',exact:true}).tap();
    await page.locator('.mobile-nav').getByRole('button',{name:'あなた',exact:true}).tap();
    await expect(page.getByRole('heading',{name:'あなたらしく、歩こう。'})).toBeVisible();
    await page.getByRole('button',{name:'閉じる',exact:true}).tap();
    await page.locator('.area-dock').getByRole('button',{name:'音楽',exact:true}).tap();
    await expect(page.locator('.map-top')).toContainText('音楽の世界');
    await expect(page.locator('.area-dock').getByRole('button',{name:'音楽',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.locator('.mobile-nav').getByRole('button',{name:'ホーム',exact:true}).tap();
    await expect(page.locator('.map-top')).toContainText('不思議な駅');
  } finally { await context.close(); }
});
