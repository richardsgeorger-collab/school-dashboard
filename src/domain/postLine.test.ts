import { describe, expect, it } from 'vitest';
import { EMPTY_POST, isAttachmentStub, postLine } from './postLine';

describe('the one line a post gets', () => {
  it('is the reader’s summary when there is one', () => {
    expect(postLine({ title: 'attached', resources: [{ name: 'Tutorial.docx' }] }, 'Homework 3 is due Sunday; use the attached tutorial.')).toBe('Homework 3 is due Sunday; use the attached tutorial.');
  });
  it('names the files when the post is only an attachment, as George’s ESG-162 professor posts them', () => {
    expect(postLine({ title: 'Attached', resources: [{ name: 'Tutorial.docx' }] })).toBe('Attached: Tutorial.docx');
    expect(postLine({ title: 'attached', resources: [{ name: 'Topic 7 Homework.docx' }, { name: 'Topic 6 Homework.docx' }, { name: 'Topic 4 Homework.docx' }] })).toBe('Attached: Topic 7 Homework.docx +2');
    expect(postLine({ title: 'Hello , here is the ppt.', resources: [{ name: 'CHM113L_Week-3_Structure (1).pdf' }] })).toBe('Attached: CHM113L_Week-3_Structure (1).pdf');
    expect(postLine({ title: '', resources: [{ name: 'Lec2aSlide36.m' }] })).toBe('Attached: Lec2aSlide36.m');
  });
  it('keeps a real title even when files ride along, and says so when there is nothing at all', () => {
    expect(postLine({ title: 'T1 Resources', resources: [{ name: 'quadratic_solver_roots.m' }] })).toBe('T1 Resources');
    expect(postLine({ title: 'T6 MATLAB Vectors Assignment', resources: [{ name: 'T6 MATLAB Vectors Assignment.docx' }] })).toBe('T6 MATLAB Vectors Assignment');
    expect(postLine({ title: 'We will use MATLAB today. Regards', resources: [] })).toBe('We will use MATLAB today. Regards');
    expect(postLine({ title: '', resources: [] })).toBe(EMPTY_POST);
    expect(postLine({ title: 'https://drive.google.com/drive/folders/1jUmglAam0qencL4SVLK?usp=sharing', resources: [] })).toBe('Link: drive.google.com');
    expect(isAttachmentStub('See attached files')).toBe(true);
    expect(isAttachmentStub('Quiz 1 moved')).toBe(false);
  });
});
