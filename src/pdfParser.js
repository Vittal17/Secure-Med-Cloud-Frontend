import * as pdfjsLib from 'pdfjs-dist';

// ZERO-TRUST UPGRADE: Use the local, offline worker bundled by Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export const extractVitalsFromPDF = async (file, diseaseType) => {
  try {
    // 1. Load the PDF file securely into browser memory
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    
    // 2. Read every page
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + ' ';
    }
    
    // Convert to lowercase to make searching easier
    const text = fullText.toLowerCase();
    
    console.log("Raw PDF Text Extracted Locally:", text);

    // 3. Search for the numbers based on the disease type
    if (diseaseType === 'diabetes') {
      return {
        glucose: extractNumber(text, /glucose.*?(\d+\.?\d*)/),
        bp: extractNumber(text, /(?:blood pressure|bp).*?(\d+)/),
        bmi: extractNumber(text, /bmi.*?(\d+\.?\d*)/),
        insulin: extractNumber(text, /insulin.*?(\d+\.?\d*)/),
        skin: extractNumber(text, /(?:skin thickness|skin).*?(\d+)/),
        dpf: extractNumber(text, /(?:pedigree|dpf).*?(\d+\.?\d*)/),
        preg: extractNumber(text, /pregnanc.*?(\d+)/),
        age: extractNumber(text, /age.*?(\d+)/)
      };
    } else {
      return {
        h_age: extractNumber(text, /age.*?(\d+)/),
        h_sex: text.includes('female') ? '0' : '1', 
        h_cp: extractNumber(text, /(?:chest pain|cp).*?(\d+)/),
        h_trestbps: extractNumber(text, /(?:resting bp|trestbps).*?(\d+)/),
        h_chol: extractNumber(text, /cholesterol.*?(\d+)/),
        h_fbs: extractNumber(text, /(?:fasting sugar|fbs).*?(\d+)/),
        h_thalach: extractNumber(text, /(?:max heart rate|thalach).*?(\d+)/),
        h_exang: extractNumber(text, /(?:exercise angina|exang).*?(\d+)/)
      };
    }
  } catch (error) {
    console.error("PDF Extraction Failed:", error);
    throw new Error("Could not read this PDF. Is it corrupted or password protected?");
  }
};

const extractNumber = (text, regex) => {
  const match = text.match(regex);
  return match ? match[1] : ''; 
};