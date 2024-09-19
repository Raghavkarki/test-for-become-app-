const extras = require('./nools-extras');
const taskExtras = require('./tasks-extras');
const {
  isFormArraySubmittedInWindow,
  getMostRecentLMPDateForPregnancy,
  addDays,
  isPregnancyTaskMuted,
  isAlive,
  getDateISOLocal,
  isDeliveryForm,
  isDangerSignPresentMother,
  getActiveDangerSignsMother,
  getBabyFields,
  getDueDateForPNCService,
  getActiveDangerSignsBaby,
  getActiveDangerSignsChild,
  getRiskContextNCD,
  ncdExtractFields,
  getPncServiceDangerSigns,
  getPNCServiceDangerSignReferral,
  getField
} = extras;

const {
  ancSchedule,
  pncSchedule,
  checkTaskAppliesForMentalHealthReferralFollowup,
  checkTaskAppliesForCervicalCancerFollowup,
  checkTaskResolvedForDeliveryReminder,
  checkTaskResolvedForHomeVisit,
  checkNotUndefinedorNone
} = taskExtras;

const DELIVERY_REMINDER_DAY = 282;

function generateEventForHomeVisit(visit, { start, due, end }) {
  return {
    id: `pregnancy-home-visit-${visit + 1}`,
    start,
    end,
    dueDate: function (event, contact, report) {
      const recentLMPDate = getMostRecentLMPDateForPregnancy(contact, report);
      if (recentLMPDate) { return addDays(recentLMPDate, due); }
      return addDays(report.reported_date, due);
    }
  };
}

function generateEventForPncService(visit, { start, due, end }) {
  return {
    id: `pnc-referral-followup-${visit + 1}`,
    start,
    end,
    dueDate: function (event, contact, report) {
      return getDueDateForPNCService(report, due);
    }
  };
}
// function checkConditions(hypSession, diaSession, selectedOptions, selectedOptions1) {
//   const containsAny = (options, values) => values.some(value => options.includes(value));
//   const containsAll = (options, values) => values.every(value => options.includes(value));
//   const containsNone = (options, values) => values.every(value => !options.includes(value));

//   if (selectedOptions1) {
//     if (hypSession === '2' || diaSession === '2') {
//       if (containsAny(selectedOptions1, ['c_3', 'c_4'])) {
//         if (containsNone(selectedOptions1, ['c_1', 'c_2'])) return true;
//         if (containsAll(selectedOptions1, ['c_1', 'c_2']) && diaSession === '2') return true;
//       }
//     }
//   }

//   return selectedOptions && containsNone(selectedOptions, ['c_1', 'c_2']) && containsAny(selectedOptions, ['c_3', 'c_4']);
// }

module.exports = [
  {
    name: 'breast_cancer_screening.diagnosis_followup',
    icon: 'icon-healthcare-assessment',
    title: 'task.breast_cancer_screening.diagnosis_followup.title',
    appliesTo: 'reports',
    appliesToType: ['breast_cancer'],
    appliesIf: function (contact, report) {
      return checkNotUndefinedorNone(report, 'bse_info_and_training.bse_self_check.bse_self_check_result') && isAlive(contact);
    },
    actions: [
      {
        type: 'report',
        form: 'breast_cancer_followup'
      }
    ],
    events: [
      {
        start: 15,
        end: 15,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 45);
        }
      }
    ]
  },
  {
    name: 'breast_cancer_followup.hfOrHospitalCheckup_followup',
    icon: 'icon-followup-general',
    title: 'task.breast_cancer_followup.hfOrHospitalCheckup_followup.title',
    appliesTo: 'reports',
    appliesToType: ['breast_cancer_followup'],
    appliesIf: function (contact, report) {
      return getField(report, 'form_questions.visited_hf') === 'no' && isAlive(contact);
    },
    actions: [
      {
        type: 'report',
        form: 'breast_cancer_followup'
      }
    ],
    events: [
      {
        start: 15,
        end: 15,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 105);
        }
      }
    ]
  },
  {
    name: 'anc.pregnancy_home_visit.known_lmp',
    icon: 'icon-pregnancy',
    title: 'task.anc.pregnancy_home_visit.title',
    appliesTo: 'reports',
    appliesToType: ['pregnancy'],
    appliesIf: function (contact, report) {
      return getField(report, 'gestational_age.method_lmp.u_lmp_date') !== undefined && isAlive(contact);
    },
    actions: [
      {
        type: 'report',
        form: 'pregnancy_home_visit',
        modifyContent: (content, contact, report, event) => {
          content.visit = event.id.slice(event.id.length - 1);

          const dueDate = event.dueDate(event, contact, report);
          content.current_period_start = addDays(dueDate, -event.start);
          content.current_period_end = addDays(dueDate, event.end);
        }
      }
    ],
    events: ancSchedule.map((schedule, visit) => generateEventForHomeVisit(visit, schedule)),
    resolvedIf: checkTaskResolvedForHomeVisit
  },
  {
    name: 'anc.delivery.confirmation',
    icon: 'icon-delivery',
    title: 'task.anc.delivery.confirmation.visit.title',
    appliesTo: 'reports',
    appliesToType: ['pregnancy'],
    actions: [{ form: 'delivery' }],
    events: [
      {
        start: 35,
        end: 28,
        dueDate: function (event, contact, report) {
          const recentLMPDate = getMostRecentLMPDateForPregnancy(contact, report);
          if (recentLMPDate) { return addDays(recentLMPDate, DELIVERY_REMINDER_DAY); }
          return addDays(report.reported_date, DELIVERY_REMINDER_DAY);
        }
      }
    ],
    resolvedIf: checkTaskResolvedForDeliveryReminder
  },
  {
    name: 'pnc.danger_sign_followup_mother',
    icon: 'icon-follow-up',
    title: 'task.pnc.danger_sign_followup_mother.title',
    appliesTo: 'reports',
    appliesToType: ['delivery', 'pnc_danger_sign_follow_up_mother'],
    appliesIf: function (contact, report) {
      return getField(report, 't_danger_signs_referral_follow_up') === 'yes' && isAlive(contact);
    },
    resolvedIf: function (contact, report, event, dueDate) {
      //(refused or migrated) and cleared tasks
      if (isPregnancyTaskMuted(contact)) { return true; }
      const startTime = Math.max(addDays(dueDate, - event.start).getTime(), report.reported_date + 1);//+1 so that source ds_follow_up does not resolve itself;
      const endTime = addDays(dueDate, event.end + 1).getTime();
      return isFormArraySubmittedInWindow(contact.reports, ['pnc_danger_sign_follow_up_mother'], startTime, endTime);
    },
    actions: [
      {
        type: 'report',
        form: 'pnc_danger_sign_follow_up_mother',
        modifyContent: function (content, contact, report) {
          if (isDangerSignPresentMother(report)) {
            const dangerSings = getActiveDangerSignsMother(report);
            content.past_danger_signs_ne = dangerSings.ne;
            content.past_danger_signs_en = dangerSings.en;
          } else {
            content.past_danger_signs_ne = 'कुनै पनि छैन';
            content.past_danger_signs_en = 'Not reported';
          }

          if (isDeliveryForm(report)) {
            content.delivery_uuid = report._id;
            const delivery_type = getField(report, 'preg_info.delivery_type');
            content.isCesareanSectionDelivery = delivery_type === 'cesarean_section' ? true : false;
          }
          else {
            content.delivery_uuid = getField(report, 'inputs.delivery_uuid');
          }

          if (report.form === 'pnc_danger_sign_follow_up_mother') {
            content.isCesareanSectionDelivery = getField(report, 'inputs.isCesareanSectionDelivery') || false;
          }
          else {
            content.delivery_uuid = getField(report, 'inputs.delivery_uuid');
          }
        }
      }
    ],
    events: [
      {
        id: 'pnc-danger-sign-follow-up-mother',
        start: 3,
        end: 7,
        dueDate: function (event, contact, report) {
          return getDateISOLocal(getField(report, 't_danger_signs_referral_follow_up_date'));
        }
      }
    ]
  },
  {
    name: 'pnc.danger_sign_followup_baby.from_contact',
    icon: 'icon-follow-up',
    title: 'task.pnc.danger_sign_followup_baby.title',
    appliesTo: 'contacts',
    appliesToType: ['c82_person'],
    appliesIf: function (contact) {
      return contact.contact &&
        contact.contact.t_danger_signs_referral_follow_up === 'yes' &&
        isAlive(contact);
    },
    resolvedIf: function (contact, report, event, dueDate) {
      const startTime = Math.max(addDays(dueDate, -event.start).getTime(), contact.contact.reported_date);
      const endTime = addDays(dueDate, event.end).getTime();
      return isFormArraySubmittedInWindow(contact.reports, ['pnc_danger_sign_follow_up_baby'], startTime, endTime) && getBabyFields(contact) && getBabyFields(contact).t_danger_signs_referral_follow_up !== 'yes';
    },
    actions: [
      {
        type: 'report',
        form: 'pnc_danger_sign_follow_up_baby',
        modifyContent: function (content, contact) {
          content.delivery_uuid = contact.contact.created_by_doc;
          const dangerSigns = getActiveDangerSignsBaby(contact);
          content.past_danger_signs_baby_ne = dangerSigns.ne;
          content.past_danger_signs_baby_en = dangerSigns.en;
        }
      }
    ],
    events: [
      {
        id: 'pnc-danger-sign-follow-up-baby',
        start: 3,
        end: 7,
        dueDate: function (event, contact) {
          return getDateISOLocal(contact.contact.t_danger_signs_referral_follow_up_date);
        }
      }
    ]
  },
  {
    name: 'iucd_and_implant.complication_sign_followup.iucd_used',
    icon: 'icon-follow-up',
    title: 'task.iucd_and_implant.complication_sign_followup.iucd',
    appliesTo: 'reports',
    appliesToType: ['pregnancy_surveillance_form'],
    appliesIf: (contact, report) => checkNotUndefinedorNone(report, 'family_planning_screening.iucd.iucd_used'),
    resolvedIf: function (contact, report, event, dueDate) {
      const startTime = Math.max(addDays(dueDate, - event.start).getTime(), report.reported_date);
      const endTime = addDays(dueDate, event.end).getTime();
      return isFormArraySubmittedInWindow(contact.reports, ['danger_sign_followup_for_iucd_implant'], startTime, endTime);
    },
    actions: [{ form: 'danger_sign_followup_for_iucd_implant' }],
    events: [
      {
        id: 'danger-sign-followup-for-iucd-implant',
        start: 5,
        end: 14,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 10);
        }
      }
    ]
  },
  {
    name: 'iucd_and_implant.complication_sign_followup.implant_symptoms',
    icon: 'icon-follow-up',
    title: 'task.iucd_and_implant.complication_sign_followup.implant',
    appliesTo: 'reports',
    appliesToType: ['pregnancy_surveillance_form'],
    appliesIf: (contact, report) => checkNotUndefinedorNone(report, 'family_planning_screening.implant.implant_symptoms'),
    resolvedIf: function (contact, report, event, dueDate) {
      const startTime = Math.max(addDays(dueDate, - event.start).getTime(), report.reported_date);
      const endTime = addDays(dueDate, event.end).getTime();
      return isFormArraySubmittedInWindow(contact.reports, ['danger_sign_followup_for_iucd_implant'], startTime, endTime);
    },
    actions: [{ form: 'danger_sign_followup_for_iucd_implant' }],
    events: [
      {
        id: 'danger-sign-followup-for-iucd-implant',
        start: 2,
        end: 10,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 7);
        }
      }
    ]
  },
  {
    name: 'referral_followup_pills_depo.depo_conditions',
    icon: 'icon-followup-general',
    title: 'task.referral_followup_pills_depo.depo',
    appliesTo: 'reports',
    appliesToType: ['pregnancy_surveillance_form'],
    appliesIf: (contact, report) => checkNotUndefinedorNone(report, 'family_planning_screening.depo.depo_conditions'),
    resolvedIf: function (contact, report, event, dueDate) {
      const startTime = Math.max(addDays(dueDate, - event.start).getTime(), report.reported_date);
      const endTime = addDays(dueDate, event.end).getTime();
      return isFormArraySubmittedInWindow(contact.reports, ['referral_followup_visit'], startTime, endTime);
    },
    actions: [{ form: 'referral_followup_visit' }],
    events: [
      {
        id: 'referral-followup-visit-pills-depo',
        start: 2,
        end: 10,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 7);
        }
      }
    ]
  },
  {
    name: 'referral_followup_pills_depo.pills_conditions',
    icon: 'icon-followup-general',
    title: 'task.referral_followup_pills_depo.pills',
    appliesTo: 'reports',
    appliesToType: ['pregnancy_surveillance_form'],
    appliesIf: (contact, report) => checkNotUndefinedorNone(report, 'family_planning_screening.pills.pills_conditions'),
    resolvedIf: function (contact, report, event, dueDate) {
      const startTime = Math.max(addDays(dueDate, - event.start).getTime(), report.reported_date);
      const endTime = addDays(dueDate, event.end).getTime();
      return isFormArraySubmittedInWindow(contact.reports, ['referral_followup_visit'], startTime, endTime);
    },
    actions: [{ form: 'referral_followup_visit' }],
    events: [
      {
        id: 'referral-followup-visit-pills-depo',
        start: 5,
        end: 45,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 35);
        }
      }
    ]
  },
  {
    name: 'balanced_counseling.family_planning_followup.device_decided',
    icon: 'icon-followup-general',
    title: 'task.balanced_counseling.family_planning_followup',
    appliesTo: 'reports',
    appliesToType: ['pregnancy_surveillance_form'],
    appliesIf: (contact, report) => checkNotUndefinedorNone(report, 'balanced_consultation_process.device_decided_family_planning'),
    resolvedIf: function (contact, report, event, dueDate) {
      const startTime = Math.max(addDays(dueDate, - event.start).getTime(), report.reported_date);
      const endTime = addDays(dueDate, event.end).getTime();
      return isFormArraySubmittedInWindow(contact.reports, ['family_planning_followup_visit'], startTime, endTime);
    },
    actions: [{ form: 'family_planning_followup_visit' }],
    events: [
      {
        id: 'family-planning-followup-visit-balanced-counseling',
        start: 20,
        end: 30,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 40);
        }
      }
    ]
  },
  {
    name: 'mental_health.mental_health_referral_followup',
    icon: 'icon-mental-health-followup',
    title: 'task.mental_health.mental_health_referral_followup',
    appliesTo: 'reports',
    appliesToType: ['mental_health_screening', 'mental_health_referral_follow_up'],
    appliesIf: checkTaskAppliesForMentalHealthReferralFollowup,
    actions: [{ form: 'mental_health_referral_follow_up' }],
    events: [
      {
        id: 'mental-health-referral-follow-up',
        start: 7,
        end: 7,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 21);
        }
      }
    ]
  },
  {
    name: 'cervical_cancer.referral_followup',
    icon: 'icon-cervical-followup',
    title: 'task.cervicel_cancer.referral_followup',
    appliesTo: 'reports',
    appliesToType: ['cervical_cancer_screening', 'cervical_cancer_referral_follow_up_visit'],
    appliesIf: checkTaskAppliesForCervicalCancerFollowup,
    actions: [{ form: 'cervical_cancer_referral_follow_up_visit' }],
    events: [
      {
        id: 'cervical-cancer-referral-followup-visit',
        start: 15,
        end: 15,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, report.form === 'cervical_cancer_screening' ? 45 : 105);
        }
      }
    ]
  },
  {
    name: 'child_health.referral_followup',
    icon: 'icon-child-health-followup',
    title: 'task.child_health.referral_followup',
    appliesTo: 'reports',
    appliesToType: ['child_health_screening', 'child_referral_followup'],
    appliesIf: (contact, report) => Number.parseInt(getField(report, 'danger_trigger')) === 1,
    actions: [
      {
        type: 'report',
        form: 'child_referral_followup',
        modifyContent: function (content, contact, report) {
          Object.entries(getActiveDangerSignsChild(report)).forEach(([key, value]) => {
            content[key] = value;
          });
        }
      }
    ],
    events: [
      {
        id: 'child-health-referral-followup-visit',
        start: 4,
        end: 3,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 7);
        }
      }
    ]
  },
  {
    name: 'pnc_service_after_delivery',
    title: 'task.pnc_service_after_delivery',
    icon: 'icon-pnc_service',
    appliesTo: 'reports',
    appliesToType: ['delivery'],
    appliesIf: (contact) => {
      return isAlive(contact);
    },
    actions: [
      {
        form: 'pnc_service_form',
        modifyContent: function (content, contact, report, event) {
          content.visit = event.id.slice(event.id.length - 1);
        }
      }],
    events: pncSchedule.map((schedule, visit) => generateEventForPncService(visit, schedule)),
    resolvedIf: function (contact, report, event, dueDate) {
      return Utils.isFormSubmittedInWindow(
        contact.reports,
        'pnc_service_form',
        Utils.addDate(dueDate, -event.start).getTime(),
        Utils.addDate(dueDate, event.end + 1).getTime()
      );
    }
  },
  {
    name: 'pnc_service_referral_followup',
    title: 'task.pnc_service_referral_followup',
    icon: 'icon-pnc_referral',
    appliesTo: 'reports',
    appliesToType: ['pnc_service_form'],
    appliesIf: (contact, report) => {
      return getField(report, 'danger_trigger') === '1';
    },
    actions: [
      {
        form: 'pnc_referral_followup_form',
        modifyContent: function (content, contact, report) {
          const dangerSings = getPncServiceDangerSigns(report);
          content.danger_sign_child = dangerSings.babyDangerSigns;
          content.danger_sign_mother = dangerSings.motherDangerSigns;
        }

      }

    ],

    events: [
      {
        start: 3,
        days: 4,
        end: 7,
      },
    ],
  },
  {
    name: 'pnc_referral_followup',
    title: 'task.pnc_referral_followup',
    icon: 'icon-pnc_referral',
    appliesTo: 'reports',
    appliesToType: ['pnc_referral_followup_form'],
    appliesIf: (contact, report) => {
      return getField(report, 'pnc_referral_form.checked_up_at_health_facility') === 'no';
    },
    actions: [
      {
        form: 'pnc_referral_followup_form',
        modifyContent: function (content, contact, report) {
          Object.entries(getPNCServiceDangerSignReferral(report)).forEach(([key, value]) => {
            content[key] = value;
          });
        }
      }
    ],

    events: [
      {
        start: 3,
        days: 4,
        end: 7,
      },
    ],
  },
  {
    name: 'hypertension_screening.referral_followup',
    title: 'task.hypertension_screening.referral_followup',
    icon: 'icon-hypertension-referral',
    appliesTo: 'reports',
    appliesToType: ['hypertension_screening'],
    appliesIf: (contact, report) => {
      return getField(report, 'danger_trigger') === '1';
    },
    actions: [
      {
        form: 'hypertension_referral',
        modifyContent: function (content, contact, report) {
          const dangerSigns = getRiskContextNCD(report, 'hypertension');
          content.danger_sign_code = dangerSigns.hypertensionDangerSigns;
        }
      }
    ],
    events: [
      {
        start: 15,
        days: 30,
        end: 15
      },
    ],
  },
  {
    name: 'hypertension.referral_followup',
    title: 'task.hypertension.referral_followup',
    icon: 'icon-hypertension-referral',
    appliesTo: 'reports',
    appliesToType: ['hypertension_referral'],
    appliesIf: (contact, report) => {
      return getField(report, 'hypertension_referral_form.visit_hf') === 'no';
    },
    actions: [
      {
        form: 'hypertension_referral',
        modifyContent: function (content, contact, report) {
          const context = getRiskContextNCD(report);
          Object.entries(context).forEach(([key, value]) => {
            content[key] = value;
          });
          Object.assign(content, context, ncdExtractFields(report, 'hypertension'));

        }

      }
    ],

    events: [
      {
        start: 15,
        days: 30,
        end: 15
      },
    ],
  },

  {
    name: 'diabetes_screening.referral_followup',
    title: 'task.diabetes_screening.referral_followup',
    icon: 'icon-diabetes-referral',
    appliesTo: 'reports',
    appliesToType: ['diabetes_screening'],
    appliesIf: (contact, report) => {
      return getField(report, 'danger_trigger') === '1';
    },
    actions: [
      {
        form: 'diabetes_referral',
        modifyContent: function (content, contact, report) {
          const dangerSigns = getRiskContextNCD(report, 'diabetes');
          content.danger_sign_code = dangerSigns.diabetesDangerSigns;
        }
      }
    ],
    events: [
      {
        start: 15,
        days: 30,
        end: 15
      },
    ],
  },
  {
    name: 'diabetes.referral_followup',
    title: 'task.diabetes.referral_followup',
    icon: 'icon-diabetes-referral',
    appliesTo: 'reports',
    appliesToType: ['diabetes_referral'],
    appliesIf: (contact, report) => {
      return getField(report, 'diabetes_referral_form.visit_hf') === 'no';
    },
    actions: [
      {
        form: 'diabetes_referral',
        modifyContent: function (content, contact, report) {
          const context = getRiskContextNCD(report);
          Object.entries(context).forEach(([key, value]) => {
            content[key] = value;
          });
          Object.assign(content, context, ncdExtractFields(report, 'diabetes'));
        }
      }
    ],

    events: [
      {
        start: 15,
        days: 30,
        end: 15
      },
    ],
  },
  {
    name: 'anxiety1',
    icon: 'icon-child-health-followup',
    title: 'task.anxiety_session1',
    appliesTo: 'reports',
    appliesToType: ['Test_1'],
    appliesIf: (contact, report) => {
      const selectedOptions = getField(report, 'pnc_service_info.ch_1');
      return selectedOptions && selectedOptions.includes('c_1');
    },
    actions: [
      {
        type: 'report',
        form: 'Test_2',
        modifyContent: function (content) {
          content.hyp_session = '1';

        }
      }
    ],
    events: [
      {
        start: 30,
        days: 30,
        end: 15
      },
    ]
  },
  {
    name: 'anxiety2',
    icon: 'icon-child-health-followup',
    title: 'task.anxiety_session2',
    appliesTo: 'reports',
    appliesToType: ['Test_2'],
    appliesIf: (contact, report) => {
      return getField(report, 'hyp_session') === '1';
    },
    actions: [
      {
        type: 'report',
        form: 'Test_2',
        modifyContent: function (content) {
          content.hyp_session = '2';

        }
      }
    ],
    events: [
      {
        start: 30,
        days: 30,
        end: 15
      },
    ]
  },
  {
    name: 'depression1',
    icon: 'icon-child-health-followup',
    title: 'task.depression_session1',
    appliesTo: 'reports',
    appliesToType: ['Test_2', 'Test_1'],
    appliesIf: (contact, report) => {
      const hypSession = getField(report, 'hyp_session');
      const selectedOptions = getField(report, 'pnc_service_info.ch_1');
      const selectedOptions1 = getField(report, 'previous_ctx');


      return (hypSession === '2' && selectedOptions1 && selectedOptions1.includes('c_2')) || (selectedOptions && !selectedOptions.includes('c_1') && selectedOptions.includes('c_2')); //in this task when hypsession==2 session is the condition we should also keep the condition to check if the diabeties is slected or not this ca be done by pulling the last report of test 1 or action form data. 
      // return (hypSession === '2' && selectedOptions && selectedOptions.includes('c_2') );
      // console.log("helloworld");

    },
    actions: [
      {
        type: 'report',
        form: 'Test_2',
        modifyContent: function (content) {
          content.dia_session = '1';

        }
      }
    ],
    events: [
      {
        start: 30,
        days: 30,
        end: 15
      },
    ]
  },
  {
    name: 'depression2',
    icon: 'icon-child-health-followup',
    title: 'task.depression_session2',
    appliesTo: 'reports',
    appliesToType: ['Test_2'],
    appliesIf: (contact, report) => {
      return getField(report, 'dia_session') === '1';

    },
    actions: [
      {
        type: 'report',
        form: 'Test_2',
        modifyContent: function (content) {
          content.dia_session = '2';

        }
      }
    ],
    events: [
      {
        start: 30,
        days: 30,
        end: 15
      },
    ]
  },
  {
    name: 'Diabetes&Hypertension1',
    icon: 'icon-child-health-followup',
    title: 'task.MA_session1',
    appliesTo: 'reports',
    appliesToType: ['Test_2', 'Test_1'],
    appliesIf: (contact, report) => {
      const hypSession = getField(report, 'hyp_session');
      const diaSession = getField(report, 'dia_session');
      const selectedOptions = getField(report, 'pnc_service_info.ch_1');
      const selectedOptions1 = getField(report, 'previous_ctx');

      // return checkConditions(hypSession, diaSession, selectedOptions, selectedOptions1);
      return (hypSession === '2' &&
        selectedOptions1 &&
        (selectedOptions1.includes('c_3') || selectedOptions1.includes('c_4')) && 
        !selectedOptions1.includes('c_2')) || (diaSession === '2' &&
          selectedOptions1 &&
          (selectedOptions1.includes('c_3') || selectedOptions1.includes('c_4')) &&
          !selectedOptions1.includes('c_1')) || (diaSession === '2' &&
            selectedOptions1 &&
            (selectedOptions1.includes('c_3') || selectedOptions1.includes('c_4')) &&
            selectedOptions1.includes('c_2') && selectedOptions1.includes('c_1')) ||(selectedOptions && 
            !selectedOptions.includes('c_1') && !selectedOptions.includes('c_2') 
            && (selectedOptions.includes('c_3') || selectedOptions.includes('c_4'))); 


    },
    actions: [
      {
        type: 'report',
        form: 'Test_2',
        modifyContent: function (content) {
          content.ma_session = '1';

        }
      }
    ],
    events: [
      {
        start: 30,
        days: 30,
        end: 15
      },
    ]
  },
  {
    name: 'Diabetes&Hypertension2',
    icon: 'icon-child-health-followup',
    title: 'task.MA_session2',
    appliesTo: 'reports',
    appliesToType: ['Test_2'],
    appliesIf: (contact, report) => {
      return getField(report, 'ma_session') === '1';

    },
    actions: [
      {
        type: 'report',
        form: 'Test_2',
        modifyContent: function (content) {
          content.ma_session = '2';

        }
      }
    ],
    events: [
      {
        start: 30,
        days: 30,
        end: 15
      },
    ]
  },
  {
    name: 'Diabetes&Hypertension3',
    icon: 'icon-child-health-followup',
    title: 'task.MA_session3',
    appliesTo: 'reports',
    appliesToType: ['Test_2'],
    appliesIf: (contact, report) => {
      return getField(report, 'ma_session') === '2';

    },
    actions: [
      {
        type: 'report',
        form: 'Test_2',
        modifyContent: function (content) {
          content.ma_session = '3';

        }
      }
    ],
    events: [
      {
        start: 30,
        days: 30,
        end: 15
      },
    ]
  },
  {
    name: 'Diabetes&Hypertension4',
    icon: 'icon-child-health-followup',
    title: 'task.MA_session4',
    appliesTo: 'reports',
    appliesToType: ['Test_2'],
    appliesIf: (contact, report) => {
      return getField(report, 'ma_session') === '3';

    },
    actions: [
      {
        type: 'report',
        form: 'Test_2',
        modifyContent: function (content) {
          content.ma_session = '4';

        }
      }
    ],
    events: [
      {
        start: 30,
        days: 30,
        end: 15
      },
    ]
  },
];



