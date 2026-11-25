// scripts/schedule-archive/legacy-schedule-defs.mjs
//
// DEVELOPER REFERENCE ONLY. The two calendars the Desk ran before SY26-27:
//   SUMMER26  Summer 2026 prep (Units 1-5), self-paced
//   SY25-26   Spring 2026 (Units 6-9), Periods B and E
// They are kept to copy from when the next schedule is built (for example SUMMER27).
// No page loads this file, so students and teachers never see these calendars.
// Until 2026-11-24 both sat inside the Desk's SCHEDULE_DEFS as dead code.
//
// The entries are exactly what the Desk carried (old 9-unit lesson keys and labels included).
// They use the Desk's cell builder d(...) and its day sentinels, so the caller passes those in:
//
//   import { legacyScheduleDefs } from './legacy-schedule-defs.mjs';
//   const defs = legacyScheduleDefs({ d, R, OFF, EX, PO, NC });
//   defs['SUMMER26']   defs['SY25-26']
//
// To look at one in the Desk on your own machine: add its entry to SCHEDULE_DEFS and run
// loadYear('SUMMER26') in the console. computeDefaultYear() always picks SY26-27, so nothing
// here can reach a student by accident.
export const LEGACY_SCHEDULE_KEYS = ['SUMMER26', 'SY25-26'];

export function legacyScheduleDefs({ d, R, OFF, EX, PO, NC }) {
  return {
  "SUMMER26": {
    label: "Summer 2026 — Units 1–5 Prep",
    school: "Lynn English High School",
    examDate: [2026,8,1],
    range: { start: [2026,5,20], end: [2026,7,25] },
    periods: {
      B: { label:"Self-paced", meetsDays:[1,2,3,4,5], doubleDay:null, schoologyCourse:null },
      E: { label:"Self-paced", meetsDays:[1,2,3,4,5], doubleDay:null, schoologyCourse:null }
    },
    daysOff: [],
    pacing: { B: [], E: [] },
    units: [ {id:1,label:"1-Var Data"},{id:2,label:"2-Var Data"},{id:3,label:"Sampling"},{id:4,label:"Probability"},{id:5,label:"Distributions"} ],
    _legacyS: [[2026,5,22,d("1.1","Intro: Learning from Data",1),d("1.1","Intro: Learning from Data",1)],[2026,5,23,d("1.2","Variables",1),d("1.2","Variables",1)],[2026,5,24,d("1.3","Categorical: Tables",1),d("1.3","Categorical: Tables",1)],[2026,5,25,d("1.4","Categorical: Graphs",1),d("1.4","Categorical: Graphs",1)],[2026,5,26,NC,NC],[2026,5,29,d("1.5","Quantitative: Graphs",1),d("1.5","Quantitative: Graphs",1)],[2026,5,30,d("1.6","Describing Distributions",1),d("1.6","Describing Distributions",1)],[2026,6,1,d("1.7","Summary Statistics",1),d("1.7","Summary Statistics",1)],[2026,6,2,d("1.8","Graphs of Summary Stats",1),d("1.8","Graphs of Summary Stats",1)],[2026,6,3,NC,NC],[2026,6,6,d("1.9","Comparing Distributions",1),d("1.9","Comparing Distributions",1)],[2026,6,7,d("1.10","Normal Distribution",1),d("1.10","Normal Distribution",1)],[2026,6,8,d("2.1","Intro: Are Variables Related?",2),d("2.1","Intro: Are Variables Related?",2)],[2026,6,9,d("2.2","Two Categorical Variables",2),d("2.2","Two Categorical Variables",2)],[2026,6,10,NC,NC],[2026,6,13,d("2.3","Stats: Two Categorical",2),d("2.3","Stats: Two Categorical",2)],[2026,6,14,d("2.4","Two Quantitative Variables",2),d("2.4","Two Quantitative Variables",2)],[2026,6,15,d("2.5","Correlation",2),d("2.5","Correlation",2)],[2026,6,16,d("2.6","Linear Regression Models",2),d("2.6","Linear Regression Models",2)],[2026,6,17,NC,NC],[2026,6,20,d("2.7","Residuals",2),d("2.7","Residuals",2)],[2026,6,21,d("2.8","Least Squares Regression",2),d("2.8","Least Squares Regression",2)],[2026,6,22,d("2.9","Departures from Linearity",2),d("2.9","Departures from Linearity",2)],[2026,6,23,d("3.1","Intro: Truthful Data?",3),d("3.1","Intro: Truthful Data?",3)],[2026,6,24,NC,NC],[2026,6,27,d("3.2","Planning Studies",3),d("3.2","Planning Studies",3)],[2026,6,28,d("3.3","Random Sampling",3),d("3.3","Random Sampling",3)],[2026,6,29,d("3.4","Sampling Problems",3),d("3.4","Sampling Problems",3)],[2026,6,30,d("3.5","Experimental Design",3),d("3.5","Experimental Design",3)],[2026,6,31,NC,NC],[2026,7,3,d("3.6","Exp. Design & Inference",3),d("3.6","Exp. Design & Inference",3)],[2026,7,4,d("4.1","Random Patterns & Simulation (4.1-4.2)",4),d("4.1","Random Patterns & Simulation (4.1-4.2)",4)],[2026,7,5,d("4.3","Probability Rules (4.3-4.5)",4),d("4.3","Probability Rules (4.3-4.5)",4)],[2026,7,6,d("4.6","Independent Events & Unions (4.6)",4),d("4.6","Independent Events & Unions (4.6)",4)],[2026,7,7,NC,NC],[2026,7,10,d("4.7","Random Variables & Distributions (4.7-4.8)",4),d("4.7","Random Variables & Distributions (4.7-4.8)",4)],[2026,7,11,d("4.9","Combining Random Variables (4.9)",4),d("4.9","Combining Random Variables (4.9)",4)],[2026,7,12,d("4.10","Binomial & Geometric (4.10-4.12)",4),d("4.10","Binomial & Geometric (4.10-4.12)",4)],[2026,7,13,d("5.1","Sampling Distributions Intro & Normal (5.1-5.2)",5),d("5.1","Sampling Distributions Intro & Normal (5.1-5.2)",5)],[2026,7,14,NC,NC],[2026,7,17,d("5.3","Central Limit Theorem (5.3)",5),d("5.3","Central Limit Theorem (5.3)",5)],[2026,7,18,d("5.4","Biased/Unbiased Estimators (5.4)",5),d("5.4","Biased/Unbiased Estimators (5.4)",5)],[2026,7,19,d("5.5","Sampling Dist. for Proportions (5.5)",5),d("5.5","Sampling Dist. for Proportions (5.5)",5)],[2026,7,20,d("5.6","Diff. in Sample Proportions (5.6)",5),d("5.6","Diff. in Sample Proportions (5.6)",5)],[2026,7,21,NC,NC],[2026,7,24,d("5.7","Sampling Dist. for Means (5.7)",5),d("5.7","Sampling Dist. for Means (5.7)",5)],[2026,7,25,d("5.8","Diff. in Sample Means (5.8)",5),d("5.8","Diff. in Sample Means (5.8)",5)],[2026,7,26,NC,NC],[2026,7,27,NC,NC],[2026,7,28,NC,NC]]
  },
  "SY25-26": {
    label: "Spring 2026 (archived)",
    school: "Lynn English High School",
    examDate: [2026, 4, 7],
    range: { start: [2026,2,9], end: [2026,4,8] },
    periods: {
      B: { label:"Period B", meetsDays:[1,2,4,5], doubleDay:null, schoologyCourse:"7945275782" },
      E: { label:"Period E", meetsDays:[1,3,5], doubleDay:3, schoologyCourse:"7945275798" }
    },
    daysOff: [[[2026,3,3]], [[2026,3,20],[2026,3,24]]],
    pacing: { B: [], E: [] },
    units: [
      {id:6,label:"Proportions"},{id:7,label:"Means"},
      {id:8,label:"Chi-Square"},{id:9,label:"Slopes"}
    ],
    _legacyS: [[2026,2,9,d("6.6","Concluding Test for p",6,"Quiz 6.4","Drills 6.6, Quiz 6.5"),d("6.3","Justifying Claims (CI)",6,"Quiz 5-8, U5 PC","Drills 6.3, Quiz 6.1-6.2")],[2026,2,10,d("6.7","Type I & II Errors",6,"Quiz 6.5","Drills 6.7, Quiz 6.6"),NC],[2026,2,11,NC,d("6.4+6.5","Tests + p-Values",6,"Quiz 6.1-6.2","Drills 6.4-6.5, Quiz 6.3",true)],[2026,2,12,d("6.8","CI for p1-p2",6,"Quiz 6.6","Drills 6.8, Quiz 6.7"),NC],[2026,2,13,d("6.9","Justify Claims (Diff)",6,"Quiz 6.7","Drills 6.9, Quiz 6.8"),d("6.6","Concluding Test for p",6,"Quiz 6.3","Drills 6.6, Quiz 6.4-6.5")],[2026,2,16,d("6.10","Test for p1-p2 Setup",6,"Quiz 6.8","Drills 6.10, Quiz 6.9"),d("6.7","Type I & II Errors",6,"Quiz 6.4-6.5","Drills 6.7, Quiz 6.6")],[2026,2,17,d("6.11","Test for p1-p2",6,"Quiz 6.9","U6 PC, Drills 6.11, Quiz 6.10"),NC],[2026,2,18,NC,d("6.8+6.9","CI + Justify (Diff)",6,"Quiz 6.6","Drills 6.8-6.9, Quiz 6.7",true)],[2026,2,19,d("7.1","Intro: Error",7,"Quiz 6.10","Drills 7.1"),NC],[2026,2,20,d("7.2","CI for mean",7,"","Drills 7.2, Quiz 7.1"),d("6.10","Test for p1-p2 Setup",6,"Quiz 6.7","Drills 6.10, Quiz 6.8-6.9")],[2026,2,23,d("7.3","Justify Claims (mean CI)",7,"Quiz 7.1","Drills 7.3, Quiz 7.2"),d("6.11","Test for p1-p2",6,"Quiz 6.8-6.9","U6 PC, Drills 6.11, Quiz 6.10")],[2026,2,24,d("7.4","Setting Up Test for mean",7,"Quiz 7.2","Drills 7.4, Quiz 7.3"),NC],[2026,2,25,NC,d("7.1+7.2","Intro + CI for mean",7,"Quiz 6.10","Drills 7.1-7.2, Quiz 6.11",true)],[2026,2,26,d("7.5","Test for mean",7,"Quiz 7.3","Drills 7.5, Quiz 7.4"),NC],[2026,2,27,d("7.6","CI for diff of means",7,"Quiz 7.4","Drills 7.6, Quiz 7.5"),d("7.3","Justify Claims (mean CI)",7,"Quiz 6.11","Drills 7.3, Quiz 7.1-7.2")],[2026,2,30,d("7.7","Justify (Diff Means)",7,"Quiz 7.5","Drills 7.7, Quiz 7.6"),d("7.4","Setting Up Test for mean",7,"Quiz 7.1-7.2","Drills 7.4, Quiz 7.3")],[2026,2,31,d("7.8","Test for diff means Setup",7,"Quiz 7.6","Drills 7.8, Quiz 7.7"),NC],[2026,3,1,NC,d("7.5+7.6","Test + CI (Diff Means)",7,"Quiz 7.3","Drills 7.5-7.6, Quiz 7.4",true)],[2026,3,2,d("7.9","Test for diff means",7,"Quiz 7.7","U7 PC, Drills 7.9, Quiz 7.8"),NC],[2026,3,3,OFF,OFF],[2026,3,6,d("8.1","Intro: Unexpected?",8,"Quiz 7.8","Drills 8.1, Quiz 7.9"),d("7.7","Justify (Diff Means)",7,"Quiz 7.4","Drills 7.7, Quiz 7.5-7.6")],[2026,3,7,d("8.2","GOF Test Setup",8,"Quiz 7.9","Drills 8.2, Quiz 8.1"),NC],[2026,3,8,NC,d("7.8+7.9","Test for diff means",7,"Quiz 7.5-7.6","U7 PC, Drills 7.8-7.9, Quiz 7.7",true)],[2026,3,9,d("8.3","GOF Test",8,"Quiz 8.1","Drills 8.3, Quiz 8.2"),NC],[2026,3,10,d("8.4","Expected Counts",8,"Quiz 8.2","Drills 8.4, Quiz 8.3"),d("8.1","Intro: Unexpected?",8,"Quiz 7.7","Drills 8.1")],[2026,3,13,d("8.5","Chi-Sq Homog/Indep",8,"Quiz 8.3","Drills 8.5, Quiz 8.4"),d("8.2","GOF Test Setup",8,"","Drills 8.2, Quiz 8.1")],[2026,3,14,d("8.6","Chi-Sq Test",8,"Quiz 8.4","U8 PC, Drills 8.6, Quiz 8.5"),NC],[2026,3,15,NC,d("8.3+8.4","GOF + Expected Counts",8,"Quiz 8.1","Drills 8.3-8.4, Quiz 8.2",true)],[2026,3,16,d("9.1","Intro: Points Align?",9,"Quiz 8.5","Drills 9.1, Quiz 8.6"),NC],[2026,3,17,d("9.2","CI for Slope",9,"Quiz 8.6","Drills 9.2, Quiz 9.1"),d("8.5","Chi-Sq Homog/Indep",8,"Quiz 8.2","Drills 8.5, Quiz 8.3-8.4")],[2026,3,20,OFF,OFF],[2026,3,21,OFF,OFF],[2026,3,22,OFF,OFF],[2026,3,23,OFF,OFF],[2026,3,24,OFF,OFF],[2026,3,27,d("9.3","Justify Slope (CI)",9,"Quiz 9.1","Drills 9.3, Quiz 9.2"),d("8.6","Chi-Sq Test",8,"Quiz 8.3-8.4","U8 PC, Drills 8.6, Quiz 8.5")],[2026,3,28,d("9.4","Test for Slope Setup",9,"Quiz 9.2","Drills 9.4, Quiz 9.3"),NC],[2026,3,29,NC,d("9.1+9.2","Intro + CI for Slope",9,"Quiz 8.5","Drills 9.1-9.2, Quiz 8.6",true)],[2026,3,30,d("9.5","Test for Slope",9,"Quiz 9.3","U9 PC, Drills 9.5, Quiz 9.4"),NC],[2026,4,1,d(R,"Review: U1-5",0,"Quiz 9.4",""),d("9.3","Justify Slope (CI)",9,"Quiz 8.6","Drills 9.3, Quiz 9.1-9.2")],[2026,4,4,d(R,"Review: U6-7",0),d("9.4","Test for Slope Setup",9,"Quiz 9.1-9.2","Drills 9.4, Quiz 9.3")],[2026,4,5,d(R,"Review: U8-9 + FRQ",0),NC],[2026,4,6,NC,d("9.5","Test for Slope",9,"Quiz 9.3","U9 PC, Quiz 9.4")],[2026,4,7,EX,EX],[2026,4,8,PO,PO]]
  },
  };
}
