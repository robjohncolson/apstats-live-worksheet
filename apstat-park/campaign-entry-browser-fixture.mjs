import assert from 'node:assert/strict';
import { ROUTE, SUMMARY } from './calculator-mission.mjs';

// Full browser path: push the block, solve the calculator and finish its answer.
export async function earnCampaignEntry(pages) {
  for (const page of pages) {
    await page.keyboard.down('Shift'); await page.keyboard.down('ArrowRight');
  }
  await Promise.all(pages.map(async page => {
    await page.waitForFunction(() => board.getParkScene()?.getState(), null, { timeout: 30000 });
    await page.keyboard.up('ArrowRight'); await page.keyboard.up('Shift');
  }));
  await Promise.all(pages.map(async page => {
    for (const key of [...ROUTE, ...SUMMARY.map(String)]) {
      const point = await page.evaluate(async key => {
        const { tilesFor } = await import('/apstat-park/calculator-mission.mjs');
        const scene = board.getParkScene(), state = scene.getState(), view = scene.getView();
        const tile = tilesFor(state.step).find(tile => tile.key === key);
        const rect = document.querySelector('canvas').getBoundingClientRect(), scale = Math.min(1, rect.width / 720);
        return { revision: state.revision,
          x: rect.left + (720 + tile.x + tile.w / 2 - Math.round(view.cameraX)) * scale,
          y: rect.top + (tile.y + tile.h / 2) * scale };
      }, key);
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(revision => board.getParkScene().getState().revision > revision, point.revision);
    }
  }));
  for (const page of pages) {
    await page.waitForFunction(() => board.getParkScene().getView().campaignUnlocked);
    assert.equal(await page.evaluate(() => board.getParkScene().getState().complete), true);
  }
}
