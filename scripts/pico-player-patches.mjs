// Default Player body: c62d1a8 = {-16,-47,32,46}.
// Move speed: bb66e50 initializes +41c=3; bb687e0 multiplies by +418;
// bc16120 integrates actor units per frame (not Box2D meters).
export function patchNativePlayer(file, source, replace) {
  if (file === 'src/engine/actors/PlayerGeometry.ts') {
    for (const [name, before, after] of [
      ['PLAYER_RECT_WIDTH', 26, 32], ['PLAYER_RECT_HEIGHT', 34, 46],
      ['PLAYER_RECT_CENTER_OFFSET_X', 13, 16], ['PLAYER_RECT_CENTER_OFFSET_Y', 32, 47],
    ]) source = replace(source, `export const ${name} = ${before};`, `export const ${name} = ${after};`, file);
    return source;
  }
  if (file === 'src/engine/actors/Player.ts') {
    source = source.replaceAll('\r\n', '\n');
    source = replace(source, 'Horizontal speed\n// remains the existing 300px/s with the 0.98 input scale in this bounded slice.',
      'Horizontal speed also uses actor units:\n// native 3 units/tick becomes 180 px/s.', file);
    source = replace(source, '// The engine pre-scales the input axis by 0.98 before applying MOVE_SPEED.',
      '// Ordinary directional input directly assigns GetMoveSpeed().', file);
    source = replace(source, '// PlanePlayer speed = 3.0 m/s base * 1.5 mode-5 multiplier -> 450 px/s',
      '// PlanePlayer speed = 3 units/tick * 1.5 mode-5 multiplier * 60 -> 270 px/s', file);
    source = replace(source, 'const MOVE_SPEED = 300;', 'const MOVE_SPEED = 3 * 60;', file);
    // bb6f0e0's .98 term damps retained motion when directional input is
    // disabled. Ordinary left/right input directly assigns GetMoveSpeed().
    source = replace(source, 'const MOVE_AXIS_SCALE = 0.98;', 'const MOVE_AXIS_SCALE = 1;', file);
    source = replace(source, 'const PLANE_MOVE_SPEED = 450;', 'const PLANE_MOVE_SPEED = 3 * 1.5 * 60;', file);
    source = replace(source, 'const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);',
      'const direction = input.right ? 1 : input.left ? -1 : 0;', file);
    source = replace(source, "if (this.mode === 'plane') {\n      const verticalDirection = (input.down ? 1 : 0) - (input.up || input.jump ? 1 : 0);",
      "if (this.mode === 'plane') {\n      this.velocity.x = direction * PLANE_MOVE_SPEED;\n      const verticalDirection = input.up ? -1 : input.down ? 1 : 0;", file);
    source = replace(source, 'this.charge = 1;', 'this.charge = 1;\n    this.view.scale.set(1);', file);
    source = replace(source, 'this.view.x = this.rect.x;',
      'this.view.x = this.rect.x + this.rect.width / 2 - PLAYER_RECT_CENTER_OFFSET_X * this.view.scale.x;', file);
    source = replace(source, 'this.view.y = this.rect.y;',
      'this.view.y = this.rect.y + this.rect.height + 1 - PLAYER_RECT_CENTER_OFFSET_Y * this.view.scale.y;', file);
    return source;
  }
  if (file === 'src/engine/GameRuntime.ts') {
    source = replace(source, 'const actorY = Math.fround(player.rect.y + player.rect.height - 2);',
      'const actorY = Math.fround(player.rect.y + player.rect.height + 1);', file);
    return replace(source, 'this.player.view.scale.set(nextBodyScale, nextBodyScale);',
      'this.player.view.scale.set(nextSize, nextSize);', file);
  }
  return source;
}
