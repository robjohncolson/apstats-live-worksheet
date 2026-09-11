import { buildMap, loadQuestions } from './misconception-map-sources.mjs';

const items = {};
for (const question of loadQuestions()) {
  items[question.id] = Object.fromEntries(question.choices
    .filter(choice => choice.key !== question.correct).map(choice => [choice.key, []]));
}
buildMap('data/misconception-distractor-map.json', items);
