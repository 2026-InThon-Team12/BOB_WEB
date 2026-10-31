// Fixed user-approved catalog. Keep response codes aligned with the backend.
export const preCatalog = [
  {
    "code": "DISCOVERY",
    "stage": "TRIGGER",
    "wording": "{item}을 어떻게 알게 됐어요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "ADVERTISEMENT",
          "label": "광고"
        },
        {
          "code": "SNS",
          "label": "SNS·유튜버"
        },
        {
          "code": "FRIEND",
          "label": "친구"
        },
        {
          "code": "SEARCH",
          "label": "필요해서 직접 찾음"
        },
        {
          "code": "OTHER",
          "label": "기타"
        }
      ]
    }
  },
  {
    "code": "CURRENT_MOOD",
    "stage": "TRIGGER",
    "wording": "{item}을 사고 싶은 지금 기분은 어때요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "STRESS",
          "label": "스트레스"
        },
        {
          "code": "BORED",
          "label": "심심함"
        },
        {
          "code": "HAPPY",
          "label": "기분 좋음"
        },
        {
          "code": "NORMAL",
          "label": "평소와 같음"
        }
      ]
    }
  },
  {
    "code": "DISCOUNT_PRESSURE",
    "stage": "TRIGGER",
    "wording": "{item}의 할인·한정 판매 때문에 서두르고 있나요? 정가여도 살까요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "HURRIED_BUY",
          "label": "서두르고 있지만 정가여도 살 거예요"
        },
        {
          "code": "HURRIED_SKIP",
          "label": "할인·한정이 아니면 안 살 것 같아요"
        },
        {
          "code": "NO_PRESSURE",
          "label": "할인·한정 때문에 서두르는 건 아니에요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "RECENT_NEED",
    "stage": "NECESSITY",
    "wording": "최근에 {item}이 없어서 불편했던 적이 있어요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "YES",
          "label": "네"
        },
        {
          "code": "NO",
          "label": "아니요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "ALTERNATIVES",
    "stage": "NECESSITY",
    "wording": "{item}과 비슷한 것을 이미 갖고 있나요? 그걸로 대신할 수 있나요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "NONE",
          "label": "비슷한 게 없어요"
        },
        {
          "code": "SUFFICIENT",
          "label": "있고 대신 쓸 수 있어요"
        },
        {
          "code": "INSUFFICIENT",
          "label": "있지만 대신 쓰기 어려워요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "PROBLEM_TO_SOLVE",
    "stage": "NECESSITY",
    "wording": "{item}이 해결해 줄 문제를 한 문장으로 말한다면 무엇인가요?",
    "spec": {
      "type": "TEXT",
      "max_length": 300,
      "options": [
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "FIRST_USE",
    "stage": "PREDICTION",
    "wording": "{item}을 산다면 언제, 어떤 상황에서 처음 쓸 것 같아요?",
    "spec": {
      "type": "OBJECT",
      "fields": {
        "when": {
          "type": "CHOICE",
          "options": [
            {
              "code": "TODAY",
              "label": "구매 당일"
            },
            {
              "code": "TOMORROW",
              "label": "구매 다음 날"
            },
            {
              "code": "THIS_WEEK",
              "label": "일주일 안에"
            },
            {
              "code": "THIS_MONTH",
              "label": "한 달 안에"
            },
            {
              "code": "UNPLANNED",
              "label": "아직 계획 없음"
            },
            {
              "code": "UNSURE",
              "label": "잘 모르겠어요"
            }
          ]
        },
        "context": {
          "type": "CHOICE",
          "options": [
            {
              "code": "COMMUTE",
              "label": "출퇴근·이동"
            },
            {
              "code": "WORK_STUDY",
              "label": "업무·공부"
            },
            {
              "code": "EXERCISE",
              "label": "운동"
            },
            {
              "code": "OUTING",
              "label": "외출·약속"
            },
            {
              "code": "HOME",
              "label": "집·일상생활"
            },
            {
              "code": "HOBBY",
              "label": "취미"
            },
            {
              "code": "OTHER",
              "label": "기타"
            },
            {
              "code": "UNSURE",
              "label": "잘 모르겠어요"
            }
          ]
        }
      }
    }
  },
  {
    "code": "EXPECTED_USE_DAYS",
    "stage": "PREDICTION",
    "wording": "{item}을 산 뒤 30일 동안 며칠 사용할 것 같아요?",
    "spec": {
      "type": "INTEGER",
      "unit": "DAYS",
      "minimum": 0,
      "maximum": 30,
      "options": [
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "CASH_CHOICE",
    "stage": "VALUE",
    "wording": "{item}의 가격만큼 지금 현금으로 받는다면, 그래도 이 물건을 살까요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "BUY",
          "label": "그래도 살 거예요"
        },
        {
          "code": "KEEP",
          "label": "현금으로 갖고 있을래요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "WORK_VALUE",
    "stage": "VALUE",
    "wording": "{item}을 사는 데 필요한 근로 시간을 생각하면 그만큼의 가치가 있나요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "YES",
          "label": "가치가 있어요"
        },
        {
          "code": "NO",
          "label": "그만큼은 아닌 것 같아요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "GOAL_DELAY",
    "stage": "VALUE",
    "wording": "내 목표 달성이 표시된 일수만큼 늦어져도 {item}을 사고 싶나요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "YES",
          "label": "네"
        },
        {
          "code": "NO",
          "label": "아니요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "WANTED_WEEK_AGO",
    "stage": "PERSISTENCE",
    "wording": "일주일 전에도 {item}이 갖고 싶었나요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "YES",
          "label": "네"
        },
        {
          "code": "NO",
          "label": "아니요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "SHOW_TO",
    "stage": "PERSISTENCE",
    "wording": "{item}을 사고 나서 제일 먼저 누구에게 보여주고 싶어요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "SELF",
          "label": "나 자신"
        },
        {
          "code": "FAMILY",
          "label": "가족·연인"
        },
        {
          "code": "FRIEND",
          "label": "친구"
        },
        {
          "code": "SNS",
          "label": "SNS에 올리고 싶어요"
        },
        {
          "code": "NO_ONE",
          "label": "보여줄 생각은 없어요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "REPLACE_IF_LOST",
    "stage": "PERSISTENCE",
    "wording": "{item}을 산 뒤 잃어버린다면 똑같은 것을 다시 살 건가요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "YES",
          "label": "네"
        },
        {
          "code": "NO",
          "label": "아니요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  }
];
export const postCatalog = [
  {
    "code": "EXPECTATION",
    "stage": "IMMEDIATE",
    "wording": "{item}을 받아보니 기대했던 것과 비교해 어때요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "ABOVE",
          "label": "기대 이상"
        },
        {
          "code": "SIMILAR",
          "label": "비슷함"
        },
        {
          "code": "BELOW",
          "label": "기대 이하"
        }
      ]
    }
  },
  {
    "code": "MOOD",
    "stage": "IMMEDIATE",
    "wording": "{item}을 산 지금 기분은 어떤가요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "EXCITED",
          "label": "설렘"
        },
        {
          "code": "NEUTRAL",
          "label": "덤덤함"
        },
        {
          "code": "REGRET",
          "label": "살짝 후회"
        }
      ]
    }
  },
  {
    "code": "CHAIN_PURCHASE",
    "stage": "IMMEDIATE",
    "wording": "{item}을 사고 나서 바로 또 사고 싶은 게 생겼나요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "YES",
          "label": "네"
        },
        {
          "code": "NO",
          "label": "아니요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "USAGE_DAYS",
    "stage": "USAGE",
    "wording": "{item}을 표시된 기간 동안 며칠 사용했나요?",
    "spec": {
      "type": "CHOICE",
      "options": []
    }
  },
  {
    "code": "USAGE_CONTEXT",
    "stage": "USAGE",
    "wording": "{item}을 최근에 주로 어떤 상황에서 사용했나요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "COMMUTE",
          "label": "출퇴근·이동"
        },
        {
          "code": "WORK_STUDY",
          "label": "업무·공부"
        },
        {
          "code": "EXERCISE",
          "label": "운동"
        },
        {
          "code": "OUTING",
          "label": "외출·약속"
        },
        {
          "code": "HOME",
          "label": "집·일상생활"
        },
        {
          "code": "HOBBY",
          "label": "취미"
        },
        {
          "code": "OTHER",
          "label": "기타"
        },
        {
          "code": "NO_USE",
          "label": "사용하지 않았어요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "NON_USE_REASON",
    "stage": "USAGE",
    "wording": "{item}을 사용하지 않았다면 이유는 무엇인가요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "NO_OCCASION",
          "label": "쓸 일이 없었음"
        },
        {
          "code": "INCONVENIENT",
          "label": "생각보다 불편"
        },
        {
          "code": "FORGOT",
          "label": "잊고 있었음"
        },
        {
          "code": "OTHER",
          "label": "기타"
        },
        {
          "code": "USED",
          "label": "사용했어요"
        }
      ]
    }
  },
  {
    "code": "BUY_AGAIN",
    "stage": "VALUE",
    "wording": "지금 다시 고른다면 {item}을 살 건가요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "SAME",
          "label": "그대로 산다"
        },
        {
          "code": "CHEAPER",
          "label": "더 싼 걸 산다"
        },
        {
          "code": "NO",
          "label": "안 산다"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "VALUE_WORTH",
    "stage": "VALUE",
    "wording": "{item}의 구매 가격과 실제 사용을 돌아보면 그만한 가치가 있었나요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "YES",
          "label": "가치가 있었어요"
        },
        {
          "code": "PARTLY",
          "label": "어느 정도 있었어요"
        },
        {
          "code": "NO",
          "label": "별로 없었어요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "GOAL_TRADEOFF",
    "stage": "VALUE",
    "wording": "{item}에 쓴 돈을 내 목표에 썼다면 어땠을 것 같아요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "GOAL",
          "label": "목표에 쓰는 게 더 좋았겠어요"
        },
        {
          "code": "PURCHASE",
          "label": "이 물건을 산 게 더 좋아요"
        },
        {
          "code": "SIMILAR",
          "label": "비슷해요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "PROBLEM_SOLVED",
    "stage": "MOTIVE",
    "wording": "{item}을 살 때 기대했던 필요나 문제가 실제로 해결됐나요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "YES",
          "label": "해결됐어요"
        },
        {
          "code": "PARTLY",
          "label": "일부 해결됐어요"
        },
        {
          "code": "NO",
          "label": "해결되지 않았어요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "TRUE_MOTIVE",
    "stage": "MOTIVE",
    "wording": "돌아보면 {item}을 산 진짜 이유는 무엇이었던 것 같아요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "NEED",
          "label": "필요"
        },
        {
          "code": "MOOD",
          "label": "기분"
        },
        {
          "code": "ADVERTISEMENT",
          "label": "광고"
        },
        {
          "code": "SOCIAL",
          "label": "남들이 다 있어서"
        },
        {
          "code": "OTHER",
          "label": "기타"
        }
      ]
    }
  },
  {
    "code": "RECOMMEND",
    "stage": "MOTIVE",
    "wording": "주변 사람에게 {item}을 추천하겠어요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "YES",
          "label": "네"
        },
        {
          "code": "NO",
          "label": "아니요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "LONG_USAGE",
    "stage": "LONG_TERM",
    "wording": "{item}을 아직 사용하고 있나요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "OFTEN",
          "label": "자주"
        },
        {
          "code": "SOMETIMES",
          "label": "가끔"
        },
        {
          "code": "UNUSED",
          "label": "방치 중"
        },
        {
          "code": "DISPOSED",
          "label": "팔았거나 버림"
        }
      ]
    }
  },
  {
    "code": "REPURCHASE",
    "stage": "LONG_TERM",
    "wording": "{item}을 잃어버리면 다시 살 건가요?",
    "spec": {
      "type": "CHOICE",
      "options": [
        {
          "code": "YES",
          "label": "네"
        },
        {
          "code": "NO",
          "label": "아니요"
        },
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  },
  {
    "code": "RESALE_VALUE",
    "stage": "LONG_TERM",
    "wording": "{item}을 지금 중고로 판다면 얼마를 받을 수 있을 것 같아요?",
    "spec": {
      "type": "INTEGER",
      "unit": "KRW",
      "minimum": 0,
      "maximum": 1000000000000,
      "options": [
        {
          "code": "UNSURE",
          "label": "잘 모르겠어요"
        }
      ]
    }
  }
];
