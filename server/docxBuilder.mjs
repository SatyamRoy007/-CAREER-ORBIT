import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

export async function buildDocx(data) {
  const { name, email, phone, location, skills, experience = [], education = [] } = data;

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Header
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: name, bold: true, size: 36 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${phone}   ${email}   ${location}`, size: 22 }),
            ],
          }),
          new Paragraph({ text: '', spacing: { after: 200 } }),

          // Skills Section
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: 'Skills', bold: true, size: 28 })],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Languages/Frameworks - `, bold: true }),
              new TextRun({ text: skills.join(', ') }),
            ],
            spacing: { after: 200 },
          }),

          // Experience Section
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: 'Experience', bold: true, size: 28 })],
            spacing: { after: 100 },
          }),
          ...experience.flatMap(exp => [
            new Paragraph({
              children: [
                new TextRun({ text: exp.company, bold: true }),
                new TextRun({ text: `\t\t\t\t\t\t\t\t\t${exp.dates}`, bold: true }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: exp.role, italics: true }),
              ],
              spacing: { after: 100 },
            }),
            ...exp.description.split('\n').map(point => 
              new Paragraph({ text: `• ${point}`, indent: { left: 360 } })
            ),
            new Paragraph({ text: '', spacing: { after: 200 } })
          ]),

          // Education Section
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: 'Education', bold: true, size: 28 })],
            spacing: { after: 100 },
          }),
          ...education.flatMap(edu => [
            new Paragraph({
              children: [
                new TextRun({ text: edu.college, bold: true }),
                new TextRun({ text: `\t\t\t\t\t\t\t\t\t${edu.dates}`, bold: true }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: edu.degree }),
              ],
            }),
          ])
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
