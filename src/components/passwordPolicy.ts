export function passwordRequirements(value: string) {
  return [
    {
      id: 'length',
      label: '8자 이상',
      detail: '최대 128자',
      met: value.length >= 8 && value.length <= 128,
    },
    {
      id: 'english',
      label: '영문 포함',
      detail: '한글·공백 없이 입력',
      met: /^[!-~]+$/.test(value) && /[A-Za-z]/.test(value),
    },
    {
      id: 'number',
      label: '숫자 1개 이상',
      detail: '0–9',
      met: /[0-9]/.test(value),
    },
    {
      id: 'symbol',
      label: '특수문자 1개 이상',
      detail: '예: ! @ # $',
      met: /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(value),
    },
  ];
}

export function validNewPassword(value: string) {
  return passwordRequirements(value).every((requirement) => requirement.met);
}
