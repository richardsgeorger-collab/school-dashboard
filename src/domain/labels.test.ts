import { describe, expect, it } from 'vitest';
import { classifyItem } from './classify';
import { courseShortName, shortLabel } from './labels';

const label = (title: string, courseCode: string) => shortLabel({ title, courseCode, type: classifyItem(title, courseCode) });

const cases: [string, string, string][] = [
  ['Topic 1 Homework', 'CHM-113', 'Chem HW 1'],
  ['Topic 3 Activity', 'CHM-113', 'Chem Activity 3'],
  ['Topic 2 Review', 'ESG-162', 'Eng Math Review 2'],
  ['Topic 1 Homework', 'ESG-162', 'Eng Math HW 1'],
  ['Practice Quiz 1', 'CHM-113', 'Chem Practice Quiz 1'],
  ['Practice Final Exam', 'CHM-113', 'Chem Practice Final'],
  ['Quiz #1', 'CHM-113', 'Chem Quiz 1'],
  ['Quiz 2', 'ESG-162', 'Eng Math Quiz 2'],
  ['Exam 2', 'CHM-113', 'Chem Exam 2'],
  ['APA Quiz 1', 'ENG-105', 'English APA Quiz 1'],
  ['Topic 2 DQ 1', 'UNV-106', 'UNV DQ 2.1'],
  ['Week 3 Participation', 'CHM-113', 'Chem Participation W3'],
  ['Week 12 Participation', 'ESG-162L', 'Eng Math Lab Participation W12'],
  ['Topic 4 Participation', 'ENG-105', 'English Participation 4'],
  ['Topic 1 Quiz', 'UNV-106', 'UNV Quiz 1'],
  ['MATLAB: Systems of Equations', 'ESG-162', 'Eng Math MATLAB Systems'],
  ['MATLAB: Trigonometry', 'ESG-162', 'Eng Math MATLAB Trigonometry'],
  ['Excel: Microchip Manufacturing', 'ESG-162', 'Eng Math Excel Microchip'],
  ['CLC - Mathematical Analysis Lab 1', 'ESG-162L', 'Eng Math Lab CLC Math 1'],
  ['CLC – Materials, Production, and Design Lab 2', 'ESG-162L', 'Eng Math Lab CLC Materials 2'],
  ['CLC – Sensor Lab 1', 'ESG-162L', 'Eng Math Lab CLC Sensor 1'],
  ['CLC – Engineering Design Report with Lab', 'ESG-162L', 'Eng Math Lab Design Report'],
  ['CLC – Engineering Design Report and Demo 1', 'ESG-162L', 'Eng Math Lab Report & Demo 1'],
  ['Formal Lab Report', 'CHM-113L', 'Chem Lab Report'],
  ['Benchmark - Lab Practical Exam', 'CHM-113L', 'Chem Lab Practical'],
  ['Stoichiometry Lab', 'CHM-113L', 'Chem Lab Stoichiometry'],
  ['Emissions, Absorption, and Atomic Structure Lab', 'CHM-113L', 'Chem Lab Emissions'],
  ['Understanding Chemicals and Moles Lab', 'CHM-113L', 'Chem Lab Chemicals'],
  ['Chemical Reactions in Aqueous Solutions Lab', 'CHM-113L', 'Chem Lab Reactions'],
  ["Enthalpy and Hess's Law Lab", 'CHM-113L', 'Chem Lab Enthalpy'],
  ['Chemical Safety and Equipment', 'CHM-113L', 'Chem Lab Safety'],
  ['Chemistry Connections Essay', 'CHM-113L', 'Chem Lab Connections Essay'],
  ['Chemistry Connections Presentation', 'CHM-113L', 'Chem Lab Connections Talk'],
  ['First Draft of a Rhetorical Analysis (On-Ground)', 'ENG-105', 'English Rhetorical Draft'],
  ['Final Draft of a Rhetorical Analysis (On-Ground)', 'ENG-105', 'English Rhetorical Final'],
  ['Review of AI Generated Text (On-Ground)', 'ENG-105', 'English AI Text Review'],
  ['First Draft of a Review Assignment (On-Ground)', 'ENG-105', 'English Review Draft'],
  ['Review Assignment: Peer or Self Review (On-Ground)', 'ENG-105', 'English Peer Review'],
  ['Final Draft of a Review Assignment (On-Ground)', 'ENG-105', 'English Review Final'],
  ['First Draft of an Op-Ed Assignment (On-Ground)', 'ENG-105', 'English Op-Ed Draft'],
  ['Self-Review and Reflection on an Op-ed (On-Ground)', 'ENG-105', 'English Op-Ed Self-Review'],
  ['Final Draft of an Op-Ed Assignment (On-Ground)', 'ENG-105', 'English Op-Ed Final'],
  ['Microsoft Office 365 Quiz', 'UNV-106', 'UNV Office 365 Quiz'],
  ['AI-Assisted Career Reflection', 'UNV-106', 'UNV Career Reflection'],
  ['Technology & Online Time Tracking (Excel Assignment)', 'UNV-106', 'UNV Excel Time Tracking'],
  ['Online Privacy & Security (PowerPoint Assignment)', 'UNV-106', 'UNV Privacy Slides'],
  ['UNV-106 Purpose Plan: Academic, Spiritual, and Career', 'UNV-106', 'UNV Purpose Plan'],
  ['Final Video Reflection', 'UNV-106', 'UNV Video Reflection'],
  ['Academic Plan', 'ESG-162', 'Eng Math Academic Plan'],
  ['Academic Plan Reflection', 'ESG-162', 'Eng Math Plan Reflection'],
  ['CHM113 Prerequisite Concept Assignment', 'CHM-113', 'Chem Prereq Concepts'],
  ['Effective Scheduling', 'ESG-162L', 'Eng Math Lab Scheduling'],
  ['Course Reflection', 'ESG-162L', 'Eng Math Lab Course Reflection'],
  ['Homework 3', 'MAT-154', 'MAT HW 3'],
  ['Some Long Assignment Title About the Thing (Online)', 'PHY-111', 'PHY Some Long Title'],
];

describe('shortLabel', () => {
  it.each(cases)('%s (%s) -> %s', (title, course, expected) => {
    expect(label(title, course)).toBe(expected);
  });
});

describe('courseShortName', () => {
  it('maps known codes and falls back to the department prefix', () => {
    expect(courseShortName('CHM-113')).toBe('Chem');
    expect(courseShortName('CHM-113L')).toBe('Chem Lab');
    expect(courseShortName('ESG-162L')).toBe('Eng Math Lab');
    expect(courseShortName('MAT-154')).toBe('MAT');
    expect(courseShortName('BIO-181L')).toBe('BIO Lab');
  });
});
