import { describe, expect, it } from 'vitest';
import { classifyItem } from './classify';
import { estimateMinutes } from './estimate';

const est = (title: string, courseCode: string, points: number) =>
  estimateMinutes({ title, type: classifyItem(title, courseCode), points, courseCode });

const cases: [string, string, number, number][] = [
  ['Exam 1', 'CHM-113', 150, 420],
  ['Exam 2', 'CHM-113', 200, 480],
  ['Quiz #1', 'CHM-113', 50, 120],
  ['Quiz 1', 'ESG-162', 70, 120],
  ['Practice Quiz 1', 'CHM-113', 20, 60],
  ['Practice Final Exam', 'CHM-113', 25, 90],
  ['APA Quiz 1', 'ENG-105', 20, 40],
  ['Topic 1 Quiz', 'UNV-106', 50, 40],
  ['Topic 1 Homework', 'CHM-113', 10, 90],
  ['Topic 1 Activity', 'CHM-113', 15, 60],
  ['Topic 1 Review', 'ESG-162', 25, 75],
  ['Topic 1 Homework', 'ESG-162', 35, 120],
  ['MATLAB: Vectors', 'ESG-162', 40, 120],
  ['Excel: Microchip Manufacturing', 'ESG-162', 40, 120],
  ['Academic Plan', 'ESG-162', 40, 90],
  ['Technology & Online Time Tracking (Excel Assignment)', 'UNV-106', 100, 120],
  ['Stoichiometry Lab', 'CHM-113L', 60, 100],
  ['Chemical Safety and Equipment', 'CHM-113L', 50, 100],
  ['Benchmark - Lab Practical Exam', 'CHM-113L', 100, 150],
  ['Chemistry Connections Essay', 'CHM-113L', 75, 270],
  ['Formal Lab Report', 'CHM-113L', 100, 360],
  ['Final Draft of an Op-Ed Assignment (On-Ground)', 'ENG-105', 240, 200],
  ['Final Draft of a Rhetorical Analysis (On-Ground)', 'ENG-105', 210, 200],
  ['First Draft of a Review Assignment (On-Ground)', 'ENG-105', 10, 100],
  ['Self-Review and Reflection on an Op-ed (On-Ground)', 'ENG-105', 40, 100],
  ['Chemistry Connections Presentation', 'CHM-113L', 75, 120],
  ['Online Privacy & Security (PowerPoint Assignment)', 'UNV-106', 100, 120],
  ['Final Video Reflection', 'UNV-106', 80, 75],
  ['AI-Assisted Career Reflection', 'UNV-106', 100, 120],
  ['CLC – Engineering Design Report with Lab', 'ESG-162L', 150, 240],
  ['CLC – Sensor Lab 1', 'ESG-162L', 50, 90],
  ['Topic 1 DQ 1', 'UNV-106', 5, 25],
  ['Week 1 Participation', 'CHM-113', 10, 20],
  ['UNV-106 Purpose Plan: Academic, Spiritual, and Career', 'UNV-106', 140, 150],
  ['Effective Scheduling', 'ESG-162L', 50, 90],
];

describe('estimateMinutes', () => {
  it.each(cases)('%s (%s, %i pts) -> %i min', (title, course, points, expected) => {
    expect(est(title, course, points)).toBe(expected);
  });
});
