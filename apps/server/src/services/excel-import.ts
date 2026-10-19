import ExcelJS from 'exceljs';

export type QuestionType = 'single' | 'multiple' | 'judgement';

export interface ParsedQuestion {
  questionType: QuestionType;
  sourceTypeLabel: string;
  stem: string;
  normalizedStem: string;
  options: Record<string, string>;
  answer: string[];
  rawAnswer: string;
  sourceSheet: string;
  sourceRow: number;
}

export interface ImportIssue {
  row: number | null;
  field: string;
  code: string;
  message: string;
}

export interface DuplicateStem {
  stem: string;
  rows: number[];
  types: QuestionType[];
}

export interface ParsedWorkbook {
  sheetNames: string[];
  selectedSheet: string;
  rowCount: number;
  questions: ParsedQuestion[];
  typeCounts: Record<QuestionType, number>;
  missingAnswers: ImportIssue[];
  errors: ImportIssue[];
  duplicateStems: DuplicateStem[];
}

const headerAliases: Record<string, string> = {
  '题型': 'type',
  '题干': 'stem',
  '选项a': 'A',
  '选项b': 'B',
  '选项c': 'C',
  '选项d': 'D',
  '选项e': 'E',
  '答案': 'answer',
};
const optionLetters = ['A', 'B', 'C', 'D', 'E'];

function normalizeHeader(value: string): string {
  return value.normalize('NFKC').replace(/[\s\u200b\u200c\u200d\ufeff]/g, '').toLowerCase();
}

export function normalizeStem(value: string): string {
  return value.normalize('NFKC').replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\s+/g, '').trim();
}

function parseType(value: string): { type: QuestionType; label: string } | undefined {
  const label = value.trim().normalize('NFKC');
  if (label === '单选题') return { type: 'single', label: value };
  if (label === '多选题') return { type: 'multiple', label: value };
  if (label === '判断题') return { type: 'judgement', label: value };
  return undefined;
}

function answerLetters(value: string): string[] | undefined {
  const normalized = value.normalize('NFKC').toUpperCase().replace(/[\s,，、;；|+]+/g, '');
  if (!normalized || !/^[A-E]+$/.test(normalized)) return undefined;
  return [...new Set(normalized)].sort();
}

function findHeader(row: ExcelJS.Row): Map<string, number> | undefined {
  const columns = new Map<string, number>();
  for (let column = 1; column <= row.cellCount; column += 1) {
    const key = headerAliases[normalizeHeader(row.getCell(column).text)];
    if (key && !columns.has(key)) columns.set(key, column);
  }
  const required = ['type', 'stem', 'A', 'B', 'C', 'D', 'E', 'answer'];
  return required.every(key => columns.has(key)) ? columns : undefined;
}

export async function parseQuestionWorkbook(buffer: Buffer, requestedSheet = ''): Promise<ParsedWorkbook> {
  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new Error('无法读取该文件，请选择有效的 .xlsx 工作簿。');
  }
  const sheetNames = workbook.worksheets.map(sheet => sheet.name);
  let worksheet = requestedSheet ? workbook.getWorksheet(requestedSheet) : workbook.getWorksheet('客观题');
  if (!worksheet && !requestedSheet && workbook.worksheets.length === 1) worksheet = workbook.worksheets[0];
  if (!worksheet) return {
    sheetNames,
    selectedSheet: '',
    rowCount: 0,
    questions: [],
    typeCounts: { single: 0, multiple: 0, judgement: 0 },
    missingAnswers: [],
    errors: [{ row: null, field: '工作表', code: requestedSheet ? 'SHEET_NOT_FOUND' : 'SHEET_SELECTION_REQUIRED', message: requestedSheet ? `工作表“${requestedSheet}”不存在。` : '请从工作簿中选择要导入的工作表。' }],
    duplicateStems: [],
  };

  let headerRow: ExcelJS.Row | undefined;
  let columns: Map<string, number> | undefined;
  for (let rowNumber = 1; rowNumber <= Math.min(20, worksheet.rowCount); rowNumber += 1) {
    const candidate = findHeader(worksheet.getRow(rowNumber));
    if (candidate) {
      headerRow = worksheet.getRow(rowNumber);
      columns = candidate;
      break;
    }
  }
  if (!headerRow || !columns) {
    return {
      sheetNames,
      selectedSheet: worksheet.name,
      rowCount: 0,
      questions: [],
      typeCounts: { single: 0, multiple: 0, judgement: 0 },
      missingAnswers: [],
      errors: [{ row: 1, field: '表头', code: 'INVALID_HEADER', message: '未找到完整表头：题型、题干、选项A-E、答案。' }],
      duplicateStems: [],
    };
  }

  const questions: ParsedQuestion[] = [];
  const errors: ImportIssue[] = [];
  const missingAnswers: ImportIssue[] = [];
  const typeCounts: Record<QuestionType, number> = { single: 0, multiple: 0, judgement: 0 };
  let rowCount = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow!.number) return;
    const values = [...columns!.entries()].map(([key, column]) => [key, row.getCell(column).text] as const);
    const cells = Object.fromEntries(values) as Record<string, string>;
    if (Object.values(cells).every(value => !value.trim())) return;
    rowCount += 1;

    const rowIssues: ImportIssue[] = [];
    const type = parseType(cells.type ?? '');
    const stem = cells.stem ?? '';
    if (!type) rowIssues.push({ row: rowNumber, field: '题型', code: 'INVALID_TYPE', message: '题型只能是单选题、多选题或判断题。' });
    if (!stem.trim()) rowIssues.push({ row: rowNumber, field: '题干', code: 'MISSING_STEM', message: '题干不能为空。' });

    const options = Object.fromEntries(optionLetters
      .map(letter => [letter, cells[letter] ?? ''] as const)
      .filter(([, value]) => value.trim().length > 0));
    if (Object.keys(options).length < 2) rowIssues.push({ row: rowNumber, field: '选项', code: 'TOO_FEW_OPTIONS', message: '每道题至少需要两个非空选项。' });

    const rawAnswer = cells.answer ?? '';
    const answer = answerLetters(rawAnswer.trim());
    if (!rawAnswer.trim()) {
      const issue = { row: rowNumber, field: '答案', code: 'MISSING_ANSWER', message: '答案不能为空。' };
      missingAnswers.push(issue);
      rowIssues.push(issue);
    } else if (!answer || !answer.every(letter => options[letter])) {
      rowIssues.push({ row: rowNumber, field: '答案', code: 'INVALID_ANSWER', message: '答案必须是当前非空选项的字母；多选答案可用任意顺序书写。' });
    } else if (type?.type !== 'multiple' && answer.length !== 1) {
      rowIssues.push({ row: rowNumber, field: '答案', code: 'ANSWER_CARDINALITY', message: '单选题和判断题只能有一个答案选项。' });
    }

    if (type) typeCounts[type.type] += 1;
    errors.push(...rowIssues);
    if (rowIssues.length || !type) return;
    questions.push({
      questionType: type.type,
      sourceTypeLabel: type.label,
      stem,
      normalizedStem: normalizeStem(stem),
      options,
      answer: answer!,
      rawAnswer,
      sourceSheet: worksheet!.name,
      sourceRow: rowNumber,
    });
  });

  const stemGroups = new Map<string, ParsedQuestion[]>();
  for (const question of questions) {
    const group = stemGroups.get(question.normalizedStem) ?? [];
    group.push(question);
    stemGroups.set(question.normalizedStem, group);
  }
  const duplicateStems = [...stemGroups.values()]
    .filter(group => group.length > 1)
    .map(group => ({
      stem: group[0]!.stem,
      rows: group.map(question => question.sourceRow),
      types: [...new Set(group.map(question => question.questionType))],
    }));

  return { sheetNames, selectedSheet: worksheet.name, rowCount, questions, typeCounts, missingAnswers, errors, duplicateStems };
}
