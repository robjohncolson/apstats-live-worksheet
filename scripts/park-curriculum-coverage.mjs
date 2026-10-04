// Keep the game's unlock evidence tied to the same lessons as Desk work.
export function curriculumCoverage(procedureId, lessonMap, schedule, workManifest, topics = null) {
  const mapped = topics || Object.entries({ ...lessonMap.lessons, ...lessonMap.bonus })
    .filter(([, procedures]) => procedures.includes(procedureId)).map(([topic]) => topic);
  // Lesson 1.8 explicitly revisits five-number summaries and box plots.
  if (!topics && ['one-var-stats', 'modified-boxplot'].includes(procedureId)) mapped.push('1.8');
  const work = workManifest.units.flatMap(unit => unit.lessons);
  return [...new Set(mapped)].map(topic => {
    const lesson = schedule.lessons[topic];
    if (!lesson) throw new Error('Missing calendar lesson: ' + topic);
    const activities = work.filter(entry => entry.lesson === topic).flatMap(entry => entry.activities);
    return {
      topic, dates: lesson.periods,
      worksheet: `u${lesson.unit}_lesson${lesson.worksheetKey}_live.html`,
      sources: [...new Set(activities.filter(activity => ['worksheet', 'quiz'].includes(activity.activity))
        .map(activity => activity.activity))],
    };
  });
}

export function firstCoveredDates(coverage) {
  return Object.fromEntries(['B', 'E'].map(period => {
    const dates = coverage.map(lesson => lesson.dates[period]).filter(date => typeof date === 'string').sort();
    return [period, dates[0] || null];
  }));
}
