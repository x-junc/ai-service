import PDFDocument from 'pdfkit';

export const generateComparisonPDF = (comparisonData) => {
  return new Promise((resolve, reject) => {
    try {
      // Create a new PDF document
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });

      // Collect PDF data chunks
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Parse the JSON data (remove markdown formatting if present)
      let jsonData;
      try {
        const cleanData = comparisonData.replace(/```json\n|\n```/g, '');
        jsonData = JSON.parse(cleanData);
      } catch (error) {
        jsonData = JSON.parse(comparisonData);
      }

      // Header
      doc.fontSize(24)
        .font('Helvetica-Bold')
        .text('Property Comparison Report', { align: 'center' })
        .moveDown(0.5);

      // Client Information
      doc.fontSize(16)
        .font('Helvetica-Bold')
        .text('Client Information')
        .moveDown(0.3);

      doc.fontSize(12)
        .font('Helvetica')
        .text(`Name: ${jsonData.client.name}`)
        .text(`Email: ${jsonData.client.email}`)
        .text(`Phone: ${jsonData.client.phone}`)
        .moveDown(1);

      // Property Comparison
      doc.fontSize(16)
        .font('Helvetica-Bold')
        .text('Property Comparison')
        .moveDown(0.5);

      // Property A
      doc.fontSize(14)
        .font('Helvetica-Bold')
        .text('Property A')
        .moveDown(0.3);

      doc.fontSize(10)
        .font('Helvetica')
        .text(`Location: ${jsonData.comparisonSummary.propertyA.location}`)
        .text(`Type: ${jsonData.comparisonSummary.propertyA.type}`)
        .text(`Area: ${jsonData.comparisonSummary.propertyA.area} m²`)
        .text(`Rooms: ${jsonData.comparisonSummary.propertyA.rooms}`)
        .text(`Price: ${jsonData.comparisonSummary.propertyA.price}`)
        .moveDown(0.3);

      doc.fontSize(10)
        .font('Helvetica-Bold')
        .text('Strengths:')
        .moveDown(0.2);

      jsonData.comparisonSummary.propertyA.strengths.forEach(strength => {
        doc.fontSize(9)
          .font('Helvetica')
          .text(`• ${strength}`);
      });

      doc.moveDown(0.3);
      doc.fontSize(10)
        .font('Helvetica-Bold')
        .text('Weaknesses:')
        .moveDown(0.2);

      jsonData.comparisonSummary.propertyA.weaknesses.forEach(weakness => {
        doc.fontSize(9)
          .font('Helvetica')
          .text(`• ${weakness}`);
      });

      doc.moveDown(1);

      // Property B
      doc.fontSize(14)
        .font('Helvetica-Bold')
        .text('Property B')
        .moveDown(0.3);

      doc.fontSize(10)
        .font('Helvetica')
        .text(`Location: ${jsonData.comparisonSummary.propertyB.location}`)
        .text(`Type: ${jsonData.comparisonSummary.propertyB.type}`)
        .text(`Area: ${jsonData.comparisonSummary.propertyB.area} m²`)
        .text(`Rooms: ${jsonData.comparisonSummary.propertyB.rooms}`)
        .text(`Price: ${jsonData.comparisonSummary.propertyB.price}`)
        .moveDown(0.3);

      doc.fontSize(10)
        .font('Helvetica-Bold')
        .text('Strengths:')
        .moveDown(0.2);

      jsonData.comparisonSummary.propertyB.strengths.forEach(strength => {
        doc.fontSize(9)
          .font('Helvetica')
          .text(`• ${strength}`);
      });

      doc.moveDown(0.3);
      doc.fontSize(10)
        .font('Helvetica-Bold')
        .text('Weaknesses:')
        .moveDown(0.2);

      jsonData.comparisonSummary.propertyB.weaknesses.forEach(weakness => {
        doc.fontSize(9)
          .font('Helvetica')
          .text(`• ${weakness}`);
      });

      doc.moveDown(1);

      // Recommendation
      doc.fontSize(16)
        .font('Helvetica-Bold')
        .text('Recommendation')
        .moveDown(0.3);

      doc.fontSize(12)
        .font('Helvetica-Bold')
        .text(`Recommended Property: ${jsonData.comparisonSummary.recommendedProperty}`)
        .moveDown(0.3);

      doc.fontSize(10)
        .font('Helvetica')
        .text('Justification:')
        .moveDown(0.2);

      doc.fontSize(9)
        .font('Helvetica')
        .text(jsonData.comparisonSummary.justification, { width: 500 })
        .moveDown(1);

      // Final Quote
      doc.fontSize(16)
        .font('Helvetica-Bold')
        .text('Final Quote')
        .moveDown(0.3);

      doc.fontSize(10)
        .font('Helvetica')
        .text(`Base Price: ${jsonData.finalQuote.basePrice} ${jsonData.finalQuote.currency}`)
        .text(`Discount: ${jsonData.finalQuote.discount} ${jsonData.finalQuote.currency}`)
        .text(`Agent Commission: ${jsonData.finalQuote.agentCommission} ${jsonData.finalQuote.currency}`)
        .moveDown(0.5);

      doc.fontSize(12)
        .font('Helvetica-Bold')
        .text(`Total Price: ${jsonData.finalQuote.totalPrice} ${jsonData.finalQuote.currency}`)
        .moveDown(1);

      // Footer
      doc.fontSize(8)
        .font('Helvetica')
        .text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, { align: 'center' });

      // Finalize the PDF
      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}; 