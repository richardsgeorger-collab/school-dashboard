import { describe, expect, it } from 'vitest';
import { classifyItem } from './classify';
import { estimateMinutes } from './estimate';

const est = (title: string, courseCode: string, points: number) =>
  estimateMinutes({ title, type: classifyItem(title, courseCode), points, courseCode });

const cases: [string, string, number, number][] = [
  ['Exam 1', 'CHM-113', 150, 630],
  ['Exam 2', 'CHM-113', 200, 720],
  ['Quiz #1', 'CHM-113', 50, 180],
  ['Quiz 1', 'ESG-162', 70, 180],
  ['Practice Quiz 1', 'CHM-113', 20, 90],
  ['Practice Final Exam', 'CHM-113', 25, 120],
  ['APA Quiz 1', 'ENG-105', 20, 60],
  ['Topic 1 Quiz', 'UNV-106', 50, 60],
  ['Topic 1 Homework', 'CHM-113', 10, 120],
  ['Topic 1 Activity', 'CHM-113', 15, 90],
  ['Topic 1 Review', 'ESG-162', 25, 120],
  ['Topic 1 Homework', 'ESG-162', 35, 180],
  ['MATLAB: Vectors', 'ESG-162', 40, 180],
  ['Excel: Microchip Manufacturing', 'ESG-162', 40, 180],
  ['Academic Plan', 'ESG-162', 40, 120],
  ['Technology & Online Time Tracking (Excel Assignment)', 'UNV-106', 100, 180],
  ['Stoichiometry Lab', 'CHM-113L', 60, 150],
  ['Chemical Safety and Equipment', 'CHM-113L', 50, 150],
  ['Benchmark - Lab Practical Exam', 'CHM-113L', 100, 240],
  ['Chemistry Connections Essay', 'CHM-113L', 75, 360],
  ['Formal Lab Report', 'CHM-113L', 100, 480],
  ['Final Draft of an Op-Ed Assignment (On-Ground)', 'ENG-105', 240, 300],
  ['Final Draft of a Rhetorical Analysis (On-Ground)', 'ENG-105', 210, 300],
  ['First Draft of a Review Assignment (On-Ground)', 'ENG-105', 10, 150],
  ['Self-Review and Reflection on an Op-ed (On-Ground)', 'ENG-105', 40, 150],
  ['Chemistry Connections Presentation', 'CHM-113L', 75, 180],
  ['Online Privacy & Security (PowerPoint Assignment)', 'UNV-106', 100, 180],
  ['Final Video Reflection', 'UNV-106', 80, 120],
  ['AI-Assisted Career Reflection', 'UNV-106', 100, 180],
  ['CLC – Engineering Design Report with Lab', 'ESG-162L', 150, 360],
  ['CLC – Sensor Lab 1', 'ESG-162L', 50, 120],
  ['Topic 1 DQ 1', 'UNV-106', 5, 30],
  ['Week 1 Participation', 'CHM-113', 10, 45],
  ['UNV-106 Purpose Plan: Academic, Spiritual, and Career', 'UNV-106', 140, 200],
  ['Effective Scheduling', 'ESG-162L', 50, 110],
];

describe('estimateMinutes', () => {
  it.each(cases)('%s (%s, %i pts) -> %i min', (title, course, points, expected) => {
    expect(est(title, course, points)).toBe(expected);
  });
});
