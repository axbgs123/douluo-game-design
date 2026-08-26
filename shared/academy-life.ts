export type AcademyLifeStage = "入学安顿" | "共同学习" | "同辈磨合" | "阶段考核" | "阶段完成";

export interface AcademyEraLifeProfile {
  periodLabel: string;
  teacherRole: string;
  arrivalAction: string;
  arrangementName: string;
  assessmentName: string;
  completionName: string;
}

const ACADEMY_ERA_LIFE_PROFILES: Record<1 | 2 | 3 | 4, AcademyEraLifeProfile> = {
  1: {
    periodLabel: "入学初期",
    teacherRole: "负责一年级课程的学院老师",
    arrivalAction: "跟学院老师看过宿舍、教室和工读安排",
    arrangementName: "课程、宿舍与工读安排",
    assessmentName: "基础课程与实战检查",
    completionName: "完成第一阶段学院生活",
  },
  2: {
    periodLabel: "新生阶段",
    teacherRole: "班主任",
    arrivalAction: "到学院登记、安顿宿舍并听清新生要求",
    arrangementName: "新生课程与宿舍安排",
    assessmentName: "新生考核",
    completionName: "通过新生阶段考核",
  },
  3: {
    periodLabel: "入学阶段",
    teacherRole: "班主任",
    arrivalAction: "到接待处报到、完成分班并安顿宿舍",
    arrangementName: "课程与分班安排",
    assessmentName: "班级阶段实战",
    completionName: "完成入学阶段学习",
  },
  4: {
    periodLabel: "入学阶段",
    teacherRole: "正班主任",
    arrivalAction: "完成报到、领取课程表并确认班级安排",
    arrangementName: "课程表与班级安排",
    assessmentName: "班级实战考核",
    completionName: "完成入学阶段训练",
  },
};

export function academyEraLifeProfile(era: number | undefined): AcademyEraLifeProfile {
  return ACADEMY_ERA_LIFE_PROFILES[era === 2 || era === 3 || era === 4 ? era : 1];
}
