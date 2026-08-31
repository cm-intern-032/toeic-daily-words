/* 所有可調參數集中於此（企劃 §10）；改這裡就好，不要改程式邏輯。 */
const CONFIG = {
  UNITS: 10,
  UNIT_SIZE: 40,

  /* 單元級記憶曲線：stage n 完成後，下次複習間隔天數 INTERVALS[stage-1]（§5）。
     注意：企劃 §5 規定 stage 達 6 即畢業，因此最後一格 30 天實際上不會用到
     （畢業前最後間隔是 15 天）；保留原表以符規格，v2 若要多一次 30 天複習，
     把 GRADUATE_STAGE 改 7 即可。 */
  INTERVALS: [1, 2, 4, 7, 15, 30],
  GRADUATE_STAGE: 6,          // stage 達 6 = 畢業，不再排入每日任務

  /* 弱字定義：box < WEAK_BOX 或 正確率 < WEAK_ACC */
  WEAK_BOX: 3,
  WEAK_ACC: 0.7,

  /* 已掌握：box >= MASTER_BOX 且 正確率 >= MASTER_ACC */
  MASTER_BOX: 3,
  MASTER_ACC: 0.7,

  /* 常錯單字：incorrect >= WRONG_MIN_INCORRECT 且 正確率 < WRONG_ACC */
  WRONG_MIN_INCORRECT: 2,
  WRONG_ACC: 0.6,

  /* 防雪崩：今日弱字總量上限，超過就把最新到期的單元延後一天（§5） */
  DAILY_WEAK_CAP: 120,

  NEW_UNIT_PER_DAY: 1,
  LEITNER_MAX_BOX: 5,
  QUIZ_OPTIONS: 4,
  SPEECH_LANG: "en-US",
  SPEECH_RATE: 0.92,
};
