import React, { useState, useEffect } from 'react';
import { UploadCloud, Activity, Heart, CheckCircle2, AlertCircle, FileText, LogOut, ShieldAlert, Key, Clock, Database, XCircle, Wallet, Copy, X, Download, ExternalLink, LineChart, TrendingDown, TrendingUp, List } from 'lucide-react';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import * as paillierBigint from 'paillier-bigint';
import CryptoJS from 'crypto-js'; // <-- NEW: AES Encryption Library
import { extractVitalsFromPDF } from './pdfParser';

export default function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [mainTab, setMainTab] = useState('upload'); 
  const [keyPair, setKeyPair] = useState(null); 
  const [showWallet, setShowWallet] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [importKeyString, setImportKeyString] = useState('');
  const [walletMessage, setWalletMessage] = useState(null);

  const [trendData, setTrendData] = useState(null);
  const [isGeneratingTrend, setIsGeneratingTrend] = useState(false);
  
  const [uploadDiseaseType, setUploadDiseaseType] = useState('diabetes');
  const [vaultFilter, setVaultFilter] = useState('all'); 

  const saveKeysLocally = (keys, userId) => {
    const keyData = {
      n: keys.publicKey.n.toString(), g: keys.publicKey.g.toString(),
      lambda: keys.privateKey.lambda.toString(), mu: keys.privateKey.mu.toString(),
      p: keys.privateKey.p ? keys.privateKey.p.toString() : null, q: keys.privateKey.q ? keys.privateKey.q.toString() : null
    };
    localStorage.setItem(`securemed_keys_${userId}`, JSON.stringify(keyData));
  };

  const loadKeysLocally = (userId) => {
    const data = localStorage.getItem(`securemed_keys_${userId}`);
    if (!data) return null;
    try {
      const parsed = JSON.parse(data);
      const pubKey = new paillierBigint.PublicKey(BigInt(parsed.n), BigInt(parsed.g));
      const privKey = new paillierBigint.PrivateKey(
        BigInt(parsed.lambda), BigInt(parsed.mu), pubKey, 
        parsed.p ? BigInt(parsed.p) : undefined, parsed.q ? BigInt(parsed.q) : undefined
      );
      return { publicKey: pubKey, privateKey: privKey };
    } catch (e) { return null; }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setLoadingSession(false);
      if (session) initializeCryptography(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) initializeCryptography(session.user.id);
    });

    const wakeUpCloudServer = async () => {
      try {
        await fetch(import.meta.env.VITE_BACKEND_URL || 'https://secure-med-cloud.onrender.com/', { mode: 'no-cors' });
        console.log("Cloud server pre-warmed.");
      } catch (e) {
        console.log("Pre-warm ping ignored.");
      }
    };
    wakeUpCloudServer();

    return () => subscription.unsubscribe();
  }, []);

  const initializeCryptography = async (userId) => {
    const existingKeys = loadKeysLocally(userId);
    if (existingKeys) { setKeyPair(existingKeys); return; }
    const keys = await paillierBigint.generateRandomKeys(1024, true);
    setKeyPair(keys); saveKeysLocally(keys, userId);
  };

  const copyPrivateKey = () => {
    if (keyPair) {
      const keyData = {
        n: keyPair.publicKey.n.toString(), g: keyPair.publicKey.g.toString(),
        lambda: keyPair.privateKey.lambda.toString(), mu: keyPair.privateKey.mu.toString(),
        p: keyPair.privateKey.p ? keyPair.privateKey.p.toString() : null, q: keyPair.privateKey.q ? keyPair.privateKey.q.toString() : null
      };
      navigator.clipboard.writeText(btoa(JSON.stringify(keyData))); setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadBackupFile = () => {
    if (!keyPair) return;
    const keyData = {
      n: keyPair.publicKey.n.toString(), g: keyPair.publicKey.g.toString(),
      lambda: keyPair.privateKey.lambda.toString(), mu: keyPair.privateKey.mu.toString(),
      p: keyPair.privateKey.p ? keyPair.privateKey.p.toString() : null, q: keyPair.privateKey.q ? keyPair.privateKey.q.toString() : null
    };
    const blob = new Blob([btoa(JSON.stringify(keyData))], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `SecureMed_Vault_Key_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleImportWallet = () => {
    try {
      const parsed = JSON.parse(atob(importKeyString));
      if (!parsed.n || !parsed.lambda) throw new Error("Invalid format");
      const pubKey = new paillierBigint.PublicKey(BigInt(parsed.n), BigInt(parsed.g));
      const privKey = new paillierBigint.PrivateKey(BigInt(parsed.lambda), BigInt(parsed.mu), pubKey, parsed.p ? BigInt(parsed.p) : undefined, parsed.q ? BigInt(parsed.q) : undefined);
      const restoredKeys = { publicKey: pubKey, privateKey: privKey };
      setKeyPair(restoredKeys); saveKeysLocally(restoredKeys, session.user.id);
      setWalletMessage({ type: 'success', text: 'Vault restored securely!' }); setImportKeyString('');
      setTimeout(() => setWalletMessage(null), 3000);
    } catch (e) { setWalletMessage({ type: 'error', text: 'Invalid Backup Token. Please check your clipboard.' }); }
  };

  const userEmail = session?.user?.email || "";
  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : "?";
  const userName = userEmail ? userEmail.split('@')[0] : "Patient";

  const [file, setFile] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [patientDecrypted, setPatientDecrypted] = useState(null);
  const [isPatientDecrypting, setIsPatientDecrypting] = useState(false);

  const [vitals, setVitals] = useState({
    glucose: '', bp: '', bmi: '', insulin: '', skin: '', dpf: '', preg: '', age: '',
    h_age: '', h_sex: '', h_cp: '', h_trestbps: '', h_chol: '', h_fbs: '', h_thalach: '', h_exang: ''
  });

  const [historyRecords, setHistoryRecords] = useState([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [decryptingHistoryId, setDecryptingHistoryId] = useState(null);
  const [decryptedHistoryResults, setDecryptedHistoryResults] = useState({});
  const [openingFileId, setOpeningFileId] = useState(null); 

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setKeyPair(null); setHistoryRecords([]); setResult(null); 
    setPatientDecrypted(null); setFile(null); setTrendData(null);
  };

  useEffect(() => {
    if (mainTab === 'vault' && session) fetchMyHistory();
  }, [mainTab, session]);

  const fetchMyHistory = async () => {
    setIsFetchingHistory(true);
    const { data, error } = await supabase.from('patient_history').select('*').eq('patient_id', session.user.id).order('created_at', { ascending: false });
    if (!error && data) setHistoryRecords(data);
    setIsFetchingHistory(false);
  };

  // --- NEW: Hybrid AES-256 File Decryption ---
  const handleViewReport = async (path, id) => {
    setOpeningFileId(id);
    try {
      // BACKWARD COMPATIBILITY: If it's an old unencrypted PDF, just open it normally
      if (path.endsWith('.pdf')) {
        const { data, error } = await supabase.storage.from('medical_reports').createSignedUrl(path, 60);
        if (error) throw new Error(error.message);
        window.open(data.signedUrl, '_blank');
        setOpeningFileId(null);
        return;
      }

      // ZERO-TRUST DECRYPTION: If it's an '.enc' file, download and decrypt locally
      if (!keyPair) throw new Error("Private Key missing. Cannot decrypt report.");

      const { data: blobData, error } = await supabase.storage.from('medical_reports').download(path);
      if (error) throw new Error("Cloud Download Failed: " + error.message);

      const encryptedText = await blobData.text();
      const securePassphrase = keyPair.privateKey.lambda.toString(); // Use private key component as AES password
      
      const decryptedBytes = CryptoJS.AES.decrypt(encryptedText, securePassphrase);
      const originalBase64Data = decryptedBytes.toString(CryptoJS.enc.Utf8);

      if (!originalBase64Data) throw new Error("Decryption failed. This file was encrypted with a different key.");

      // Convert the Base64 string back into a visual PDF
      const fetchResp = await fetch(originalBase64Data);
      const pdfBlob = await fetchResp.blob();
      const objectUrl = URL.createObjectURL(pdfBlob);

      window.open(objectUrl, '_blank');
      
      // Clean up memory after 15 seconds
      setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);

    } catch (error) {
      alert("Secure View Error: " + error.message);
    } finally {
      setOpeningFileId(null);
    }
  };

  const handleHistoryDecrypt = (id) => {
    setDecryptingHistoryId(id);
    setTimeout(() => {
      try {
        const record = historyRecords.find(r => r.id === id);
        if (record && keyPair) {
          const ciphertext = BigInt(record.encrypted_result);
          const decryptedBigInt = keyPair.privateKey.decrypt(ciphertext);
          const isNegative = decryptedBigInt > (keyPair.publicKey.n / 2n);
          setDecryptedHistoryResults(prev => ({ ...prev, [id]: isNegative ? 'Low Risk' : 'High Risk' }));
        }
      } catch (e) {
        setDecryptedHistoryResults(prev => ({ ...prev, [id]: 'Key Mismatch' }));
      }
      setDecryptingHistoryId(null);
    }, 1000);
  };

  const generateTrendAnalysis = () => {
    setIsGeneratingTrend(true);
    setTimeout(() => {
      try {
        const targetRecords = historyRecords.filter(r => r.disease_type === vaultFilter);
        const sortedRecords = [...targetRecords].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        if (sortedRecords.length < 2) {
          setTrendData({ error: `Not enough data. Please complete at least 2 ${vaultFilter === 'diabetes' ? 'Diabetes' : 'Cardiac'} analyses to generate a trend.` });
          setIsGeneratingTrend(false); return;
        }

        const timeline = sortedRecords.map(record => {
          const ciphertext = BigInt(record.encrypted_result);
          const decryptedBigInt = keyPair.privateKey.decrypt(ciphertext);
          const isNegative = decryptedBigInt > (keyPair.publicKey.n / 2n);
          const rawScore = isNegative ? Number(decryptedBigInt - keyPair.publicKey.n) : Number(decryptedBigInt);
          return {
            id: record.id,
            date: new Date(record.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
            riskLevel: isNegative ? 'Low Risk' : 'High Risk',
            scoreMagnitude: rawScore
          };
        });
        setTrendData({ error: null, timeline: timeline });
      } catch (e) { setTrendData({ error: 'Decryption failed. Records may be locked with an older cryptographic key.' }); }
      setIsGeneratingTrend(false);
    }, 1500);
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    const uploadedFile = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
    if (!uploadedFile) return;

    const fileName = uploadedFile.name.toLowerCase();
    const isHeartFile = fileName.includes('heart') || fileName.includes('cardiac') || fileName.includes('lipid');
    const isDiabetesFile = fileName.includes('diabet') || fileName.includes('sugar') || fileName.includes('glucose') || fileName.includes('a1c');

    if (uploadDiseaseType === 'diabetes' && isHeartFile) { setResult({ status: 'error', message: 'Report Mismatch: Selected Diabetes Screen, but uploaded a Cardiac report.' }); return; }
    if (uploadDiseaseType === 'heart' && isDiabetesFile) { setResult({ status: 'error', message: 'Report Mismatch: Selected Cardiac Screen, but uploaded a Diabetes report.' }); return; }

    setResult(null); setFile(uploadedFile); setIsExtracting(true);
    try {
      const extractedData = await extractVitalsFromPDF(uploadedFile, uploadDiseaseType); setVitals(extractedData);
    } catch (error) { setResult({ status: 'error', message: error.message }); setFile(null); } 
    finally { 
      setIsExtracting(false);
      // UX Polish: Reset the hidden HTML input so the user can re-upload the same file if needed
      if (document.getElementById('fileUpload')) document.getElementById('fileUpload').value = '';
    }
  };

  // Helper to read files before encrypting them
  const readFileAsDataURL = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleAnalysis = async () => {
    setIsAnalyzing(true); setResult(null); setPatientDecrypted(null); 
    if (!keyPair) { setResult({ status: 'error', message: 'Cryptographic keys are still generating.' }); setIsAnalyzing(false); return; }
    if (uploadDiseaseType === 'diabetes' && !vitals.glucose) { setResult({ status: 'error', message: 'Missing Data: We could not find required Diabetes metrics.' }); setIsAnalyzing(false); return; }
    if (uploadDiseaseType === 'heart' && !vitals.h_chol) { setResult({ status: 'error', message: 'Missing Data: We could not find required Cardiac metrics.' }); setIsAnalyzing(false); return; }

    try {
      const endpoint = `${import.meta.env.VITE_BACKEND_URL || 'https://secure-med-cloud.onrender.com'}/api/predict/${uploadDiseaseType}`;
      const rawFeatures = uploadDiseaseType === 'diabetes' 
        ? [vitals.preg, vitals.glucose, vitals.bp, vitals.skin, vitals.insulin, vitals.bmi, vitals.dpf, vitals.age]
        : [vitals.h_age, vitals.h_sex, vitals.h_cp, vitals.h_trestbps, vitals.h_chol, vitals.h_fbs, vitals.h_thalach, vitals.h_exang];
        
      const encryptedFeatures = rawFeatures.map(val => [keyPair.publicKey.encrypt(BigInt(Math.round(parseFloat(val || 0)))).toString(), 0]);
      const payload = { public_key_n: keyPair.publicKey.n.toString(), encrypted_features: encryptedFeatures };

      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`Network Error (${response.status}). Is the Python backend running?`);
      const data = await response.json();
      if (data.status === "error") throw new Error(`Python Logic Error: ${data.message}`);

      if (data.status === "success") {
        let finalFilePath = null;
        
        // --- NEW: Client-Side AES-256 File Encryption ---
        if (file) {
          const base64FileData = await readFileAsDataURL(file);
          const securePassphrase = keyPair.privateKey.lambda.toString(); // Use the highly secret Paillier component
          const encryptedFileString = CryptoJS.AES.encrypt(base64FileData, securePassphrase).toString();

          // Upload it as a text blob instead of a PDF
          const encryptedBlob = new Blob([encryptedFileString], { type: 'text/plain' });
          const uniqueFileName = `${session.user.id}/${Math.random().toString(36).substring(2)}-${Date.now()}.enc`;

          const { error: uploadError } = await supabase.storage.from('medical_reports').upload(uniqueFileName, encryptedBlob);
          if (uploadError) throw new Error("Secure File Upload Failed: " + uploadError.message);
          finalFilePath = uniqueFileName;
        }

        const { error: dbError } = await supabase.from('patient_history').insert([{
            patient_id: session.user.id, disease_type: uploadDiseaseType,
            encrypted_result: String(data.encrypted_result?.[0] || data.encrypted_result), 
            exponent: data.encrypted_result?.[1] || 0, report_file_path: finalFilePath 
        }]);
        if (dbError) throw new Error("Supabase Save Failed: " + dbError.message);
        setResult({ status: 'success', message: 'Analysis complete.', raw: data });
      } else throw new Error(data.message || "Unknown backend error");
    } catch (error) { setResult({ status: 'error', message: error.message }); } 
    finally { setIsAnalyzing(false); }
  };

  const handlePatientDecrypt = () => {
    setIsPatientDecrypting(true);
    setTimeout(() => {
      try {
        const ciphertext = BigInt(result.raw.encrypted_result[0]);
        const isNegative = keyPair.privateKey.decrypt(ciphertext) > (keyPair.publicKey.n / 2n);
        setPatientDecrypted(isNegative ? 'Low Risk' : 'High Risk');
      } catch (err) { setPatientDecrypted('Decryption Error'); } 
      finally { setIsPatientDecrypting(false); }
    }, 1500);
  };

  const resetWorkflow = () => { setFile(null); setResult(null); setPatientDecrypted(null); };
  
  const handleUploadTabSwitch = (tabName) => { if (uploadDiseaseType !== tabName) { setUploadDiseaseType(tabName); resetWorkflow(); }};
  const handleVaultFilterSwitch = (filter) => { if (vaultFilter !== filter) { setVaultFilter(filter); setTrendData(null); }};

  const getPatientRecommendation = (diseaseType, riskLevel) => {
    if (riskLevel === 'Low Risk') return ["Maintain your current healthy diet and exercise routine.", "Continue attending your standard annual physical checkups.", "Keep a personal log of your vitals to track any future changes."];
    if (riskLevel === 'High Risk' && diseaseType === 'diabetes') return ["Schedule a fasting blood glucose test with your primary care physician.", "Review your current diet, specifically looking to reduce processed sugars.", "Monitor your blood pressure and BMI trends closely over the next two weeks.", "Share this secure report with your doctor during your next visit."];
    if (riskLevel === 'High Risk' && diseaseType === 'heart') return ["Consult a cardiologist to review these specific cardiac metrics.", "Consider discussing an ECG or a standard stress test with your doctor.", "Avoid suddenly starting highly strenuous activities without medical clearance.", "Share this secure report with your doctor during your next visit."];
    return [];
  };

  function MetricCard({ label, value, unit }) {
    return (
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm">
        <p className="text-xs text-slate-500 uppercase tracking-wide font-bold">{label}</p>
        <p className="text-2xl font-black text-slate-800 mt-1">{value || '--'}</p><p className="text-sm text-slate-400 font-medium">{unit}</p>
      </div>
    );
  }

  // Clinical Minimalist Loader
  if (loadingSession) return (<div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans"><p className="text-slate-500 font-bold animate-pulse">Securing Connection...</p></div>);
  if (!session) return <Auth />;

  const activeHistoryRecords = vaultFilter === 'all' 
    ? historyRecords 
    : historyRecords.filter(record => record.disease_type === vaultFilter);

  return (
    // MAIN BACKGROUND: Clinical Minimalist Slate
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-2xl shadow-inner"><ShieldAlert className="w-8 h-8 text-white" /></div>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">SecureMed OS</h1>
              <p className="text-sm font-bold text-slate-500 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>Zero-Trust Cloud Architecture</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-inner">{userInitial}</div>
              <div className="text-sm text-left">
                <p className="text-slate-400 text-[10px] uppercase tracking-wider font-bold">Logged In</p>
                <p className="text-slate-800 font-bold leading-tight truncate max-w-[100px]">{userName}</p>
              </div>
              <button onClick={() => setShowWallet(true)} className="ml-2 bg-blue-100 hover:bg-blue-200 text-blue-700 p-1.5 rounded-xl transition-all" title="Manage Keys"><Wallet className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
              <button onClick={() => setMainTab('upload')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${mainTab === 'upload' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}><UploadCloud className="w-4 h-4"/> New</button>
              <button onClick={() => setMainTab('vault')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${mainTab === 'vault' ? 'bg-white text-purple-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}><Database className="w-4 h-4"/> Vault</button>
              <button onClick={handleSignOut} className="ml-2 px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-bold transition-all" title="Sign Out"><LogOut className="w-4 h-4"/></button>
            </div>
          </div>
        </div>

        {/* UPLOAD TAB */}
        {mainTab === 'upload' && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
            {/* UPLOAD CONTEXT TOGGLE */}
            <div className="flex justify-center gap-4 mb-6 bg-white p-1.5 rounded-2xl w-fit mx-auto border border-slate-200 shadow-sm">
              <button onClick={() => handleUploadTabSwitch('diabetes')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${uploadDiseaseType === 'diabetes' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-900'}`}><Activity className="w-4 h-4"/> Diabetes Screen</button>
              <button onClick={() => handleUploadTabSwitch('heart')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${uploadDiseaseType === 'heart' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-900'}`}><Heart className="w-4 h-4"/> Cardiac Screen</button>
            </div>

            <div className="bg-white border border-slate-200 shadow-md rounded-3xl p-6 md:p-10 w-full">
              {!file && (
                <div onDragOver={(e) => e.preventDefault()} onDrop={handleFileUpload} className="border-2 border-dashed border-indigo-200 rounded-3xl p-16 text-center hover:bg-slate-50 transition-all cursor-pointer bg-slate-50/50">
                  <input type="file" id="fileUpload" className="hidden" onChange={handleFileUpload} accept=".pdf" />
                  <label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center">
                    <div className="bg-blue-50 p-4 rounded-full mb-4"><UploadCloud className="w-10 h-10 text-blue-600" /></div>
                    <p className="text-xl font-bold text-slate-800">Upload Blood Report</p>
                    <p className="text-sm text-slate-500 mt-2 font-medium">Drag & drop your medical PDF here</p>
                  </label>
                </div>
              )}

              {isExtracting && (
                <div className="py-16 text-center">
                  <div className="relative w-20 h-20 mx-auto mb-6"><div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div><div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div><FileText className="absolute inset-0 m-auto w-8 h-8 text-blue-600 animate-pulse" /></div>
                  <p className="font-bold text-slate-800 text-lg">Running Local PDF Extraction...</p>
                </div>
              )}

              {file && !isExtracting && (
                <div className="animate-in fade-in duration-500">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-extrabold text-slate-800">Extracted Vitals</h3>
                    <button onClick={() => { setFile(null); setResult(null); }} className="text-sm font-bold text-blue-600 hover:text-blue-800">Upload Different File</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {uploadDiseaseType === 'diabetes' ? (
                      <><MetricCard label="Glucose" value={vitals.glucose} unit="mg/dL" /><MetricCard label="Blood Pressure" value={vitals.bp} unit="mmHg" /><MetricCard label="BMI" value={vitals.bmi} unit="kg/m²" /><MetricCard label="Insulin" value={vitals.insulin} unit="μU/ml" /></>
                    ) : (
                      <><MetricCard label="Resting BP" value={vitals.h_trestbps} unit="mmHg" /><MetricCard label="Cholesterol" value={vitals.h_chol} unit="mg/dL" /><MetricCard label="Max HR" value={vitals.h_thalach} unit="bpm" /><MetricCard label="Fasting Sugar" value={vitals.h_fbs} unit=">120" /></>
                    )}
                  </div>
                  <button onClick={handleAnalysis} disabled={isAnalyzing || !keyPair} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-md transition-all disabled:opacity-70 flex justify-center items-center gap-3 text-lg">
                    {isAnalyzing ? <><span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span> Encrypting & Analyzing...</> : <><ShieldAlert className="w-5 h-5"/> Run Secure Homomorphic Analysis</>}
                  </button>
                </div>
              )}

              {result && result.status === 'success' && (
                <div className="mt-8 bg-green-50/80 border border-green-200 p-6 rounded-3xl animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-green-200"><CheckCircle2 className="text-green-600 w-8 h-8" /><div><p className="font-bold text-green-900 text-lg">Cloud Analysis Complete</p><p className="text-sm text-green-700">Encrypted data secured in your personal vault.</p></div></div>
                  <div className="flex flex-col md:flex-row items-start justify-between gap-6">
                    <div className="flex-1 w-full min-w-0">
                      <p className="text-xs font-bold text-green-800 uppercase tracking-wider mb-2 flex items-center gap-1"><Database className="w-3 h-3"/> Encrypted Payload</p>
                      <p className="font-mono text-xs bg-slate-900 text-green-400 p-4 rounded-2xl break-all line-clamp-3 shadow-inner">{result.raw?.encrypted_result?.[0] || result.raw?.encrypted_result}</p>
                    </div>
                    <div className="w-full md:w-auto flex flex-col items-center justify-center min-w-[300px]">
                      {!patientDecrypted ? (
                        <button onClick={handlePatientDecrypt} disabled={isPatientDecrypting} className="w-full h-full bg-white hover:bg-slate-50 text-green-800 border border-green-300 px-6 py-4 rounded-2xl font-black transition-all shadow-sm disabled:opacity-70 flex items-center justify-center gap-2">
                          {isPatientDecrypting ? 'Applying Key...' : <><Key className="w-5 h-5"/> Apply My Private Key</>}
                        </button>
                      ) : (
                        <div className="w-full flex flex-col gap-3">
                          <div className={`w-full text-center px-8 py-4 rounded-2xl border shadow-sm ${patientDecrypted === 'High Risk' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-300'}`}>
                            <span className="text-xs font-bold uppercase block mb-1 text-slate-500">Local Decryption</span>
                            <span className={`text-2xl font-black ${patientDecrypted === 'High Risk' ? 'text-red-600' : 'text-green-700'}`}>{patientDecrypted}</span>
                          </div>
                          <div className="w-full text-sm text-slate-700 text-left border border-slate-200 bg-white p-4 rounded-2xl shadow-sm">
                            <span className="font-bold text-slate-900 mb-2 block">Recommended Next Steps:</span>
                            <ul className="list-disc pl-5 space-y-1">
                                {getPatientRecommendation(uploadDiseaseType, patientDecrypted).map((step, index) => <li key={index}>{step}</li>)}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {patientDecrypted && <button onClick={resetWorkflow} className="mt-6 w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold py-3 rounded-xl transition-all shadow-sm">Start New Analysis</button>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VAULT TAB */}
        {mainTab === 'vault' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-8">
            
            {/* VAULT FILTER CONTROLS */}
            <div className="flex flex-wrap justify-center gap-3 bg-white p-1.5 rounded-2xl w-fit mx-auto border border-slate-200 shadow-sm">
              <button onClick={() => handleVaultFilterSwitch('all')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${vaultFilter === 'all' ? 'bg-purple-50 text-purple-700' : 'text-slate-500 hover:text-slate-900'}`}><List className="w-4 h-4"/> All Records</button>
              <div className="w-px bg-slate-200 my-2"></div>
              <button onClick={() => handleVaultFilterSwitch('diabetes')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${vaultFilter === 'diabetes' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-900'}`}><Activity className="w-4 h-4"/> Diabetes</button>
              <button onClick={() => handleVaultFilterSwitch('heart')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${vaultFilter === 'heart' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-900'}`}><Heart className="w-4 h-4"/> Cardiac</button>
            </div>

            {/* CONDITIONAL ZERO TRUST ANALYTICS DASHBOARD */}
            {vaultFilter !== 'all' && (
              <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-md animate-in fade-in slide-in-from-top-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  <div>
                    <h3 className="font-extrabold text-blue-900 text-xl flex items-center gap-2"><LineChart className="w-6 h-6 text-blue-600"/> Zero-Trust {vaultFilter === 'diabetes' ? 'Diabetes' : 'Cardiac'} Trend</h3>
                    <p className="text-slate-500 text-sm mt-1 max-w-lg font-medium">Because your data is encrypted, the cloud cannot track your health. Click to securely decrypt your history locally and generate your progress timeline.</p>
                  </div>
                  <button 
                    onClick={generateTrendAnalysis} 
                    disabled={isGeneratingTrend || !keyPair}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl shadow-md transition-all flex items-center justify-center min-w-[140px]"
                  >
                    {isGeneratingTrend ? <span className="animate-pulse">Decoding...</span> : "Unlock Trend"}
                  </button>
                </div>

                {trendData?.error && (
                  <div className="bg-orange-50 border border-orange-200 text-orange-800 p-4 rounded-xl text-sm font-bold">
                    {trendData.error}
                  </div>
                )}

                {trendData?.timeline && (
                  <div className="mt-6 pt-6 border-t border-slate-100 animate-in fade-in">
                    <div className="flex overflow-x-auto pb-4 gap-4 snap-x">
                      {trendData.timeline.map((point, index) => {
                        const prevPoint = index > 0 ? trendData.timeline[index - 1] : null;
                        const isImprovement = prevPoint && point.scoreMagnitude < prevPoint.scoreMagnitude;
                        const isWorse = prevPoint && point.scoreMagnitude > prevPoint.scoreMagnitude;

                        return (
                          <div key={point.id} className="snap-center min-w-[160px] bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm flex-shrink-0">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{point.date}</p>
                            <p className={`text-lg font-black ${point.riskLevel === 'High Risk' ? 'text-red-600' : 'text-green-600'}`}>{point.riskLevel}</p>
                            
                            {index > 0 && (
                              <div className={`mt-3 flex items-center gap-1 text-sm font-bold ${isImprovement ? 'text-green-600' : isWorse ? 'text-red-500' : 'text-slate-400'}`}>
                                {isImprovement ? <TrendingDown className="w-4 h-4"/> : isWorse ? <TrendingUp className="w-4 h-4"/> : null}
                                {isImprovement ? 'Score Dropped' : isWorse ? 'Score Rose' : 'Stable'}
                              </div>
                            )}
                            {index === 0 && <div className="mt-3 text-sm font-bold text-slate-400 italic">Baseline Scan</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* FILTERED History List */}
            {isFetchingHistory ? (
              <div className="text-center py-12 text-slate-500 font-bold animate-pulse">Accessing Vault...</div>
            ) : activeHistoryRecords.length === 0 ? (
              <div className="text-center py-16 bg-white border border-slate-200 rounded-3xl shadow-sm"><Database className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="font-bold text-slate-500">You have no {vaultFilter !== 'all' ? (vaultFilter === 'diabetes' ? 'Diabetes' : 'Cardiac') : ''} records in your vault.</p></div>
            ) : (
              activeHistoryRecords.map((record) => (
                <div key={record.id} className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row gap-6 relative group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${record.disease_type === 'diabetes' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                        {record.disease_type === 'diabetes' ? <Activity className="w-3 h-3"/> : <Heart className="w-3 h-3"/>} {record.disease_type} Screen
                      </span>
                      <span className="text-xs font-bold text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3"/> {new Date(record.created_at).toLocaleDateString()}</span>
                      
                      {record.report_file_path && (
                        <button onClick={() => handleViewReport(record.report_file_path, record.id)} disabled={openingFileId === record.id} className="ml-auto text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 border border-slate-200">
                          {openingFileId === record.id ? 'Securing Link...' : <><ExternalLink className="w-3 h-3"/> Original Report</>}
                        </button>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Encrypted Ciphertext</p>
                      <p className="font-mono text-xs bg-slate-900 text-green-400 p-3 rounded-xl break-all line-clamp-2 border border-slate-700 shadow-inner">{record.encrypted_result}</p>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center min-w-[200px]">
                    {!decryptedHistoryResults[record.id] ? (
                      <button onClick={() => handleHistoryDecrypt(record.id)} disabled={decryptingHistoryId === record.id} className="w-full bg-slate-800 hover:bg-slate-900 text-white px-5 py-4 rounded-2xl font-bold transition-all shadow-sm disabled:opacity-70 flex justify-center items-center gap-2">
                        {decryptingHistoryId === record.id ? 'Decrypting...' : <><Key className="w-4 h-4"/> Apply Private Key</>}
                      </button>
                    ) : (
                      <div className={`w-full text-center px-6 py-3 rounded-2xl border ${decryptedHistoryResults[record.id] === 'High Risk' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Decrypted Diagnosis</span>
                        <span className={`text-xl font-black ${decryptedHistoryResults[record.id] === 'High Risk' ? 'text-red-600' : 'text-green-600'}`}>{decryptedHistoryResults[record.id]}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* --- CRYPTOGRAPHIC WALLET MODAL --- */}
      {showWallet && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative border border-slate-200">
            <button onClick={() => setShowWallet(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-900 transition-colors"><X className="w-6 h-6" /></button>
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-50 p-3 rounded-xl text-blue-600"><Wallet className="w-8 h-8" /></div>
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900">Your Crypto Wallet</h2><p className="text-sm font-medium text-slate-500">Manage your device-locked keys</p>
              </div>
            </div>
            {walletMessage && (<div className={`mb-4 p-3 rounded-xl text-sm font-bold ${walletMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{walletMessage.text}</div>)}
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 mb-6">
              <p className="text-sm font-bold text-slate-800 mb-2">1. Backup Vault Key</p><p className="text-xs font-medium text-slate-500 mb-4">Your key is locked to this browser. You must save this token to recover your history on a new device.</p>
              <div className="flex gap-3 mt-4">
                <button onClick={copyPrivateKey} className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 p-3 rounded-xl transition-all font-bold text-sm flex items-center justify-center gap-2 shadow-sm">
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}{copied ? "Copied!" : "Copy Text"}
                </button>
                <button onClick={downloadBackupFile} className="flex-1 bg-slate-800 hover:bg-slate-900 text-white p-3 rounded-xl transition-all font-bold text-sm flex items-center justify-center gap-2 shadow-sm">
                  <Download className="w-4 h-4" /> Download Key File
                </button>
              </div>
            </div>
            <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100 mb-6">
              <p className="text-sm font-bold text-blue-900 mb-2">2. Restore Existing Vault</p><p className="text-xs font-medium text-blue-700 mb-3">Switching devices? Paste your backup token here to regain access to your old records.</p>
              <div className="flex gap-2">
                <input type="text" value={importKeyString} onChange={(e) => setImportKeyString(e.target.value)} placeholder="Paste backup token here..." className="flex-1 text-xs px-4 py-3 rounded-xl border border-blue-200 focus:ring-2 focus:ring-blue-500 outline-none"/>
                <button onClick={handleImportWallet} disabled={!importKeyString} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm"><Download className="w-4 h-4"/> Restore</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}