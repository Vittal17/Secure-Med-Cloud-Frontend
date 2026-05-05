import React, { useState, useEffect } from 'react';
import { UploadCloud, Activity, Heart, CheckCircle2, AlertCircle, FileText, LogOut, ShieldAlert, Key, Clock, Database, XCircle, Wallet, Copy, X, Download, ExternalLink } from 'lucide-react';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import * as paillierBigint from 'paillier-bigint';
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

  const saveKeysLocally = (keys, userId) => {
    const keyData = {
      n: keys.publicKey.n.toString(),
      g: keys.publicKey.g.toString(),
      lambda: keys.privateKey.lambda.toString(),
      mu: keys.privateKey.mu.toString(),
      p: keys.privateKey.p ? keys.privateKey.p.toString() : null,
      q: keys.privateKey.q ? keys.privateKey.q.toString() : null
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
        BigInt(parsed.lambda), 
        BigInt(parsed.mu), 
        pubKey, 
        parsed.p ? BigInt(parsed.p) : undefined, 
        parsed.q ? BigInt(parsed.q) : undefined
      );
      return { publicKey: pubKey, privateKey: privKey };
    } catch (e) {
      return null;
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
      if (session) initializeCryptography(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) initializeCryptography(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const initializeCryptography = async (userId) => {
    const existingKeys = loadKeysLocally(userId);
    if (existingKeys) {
      setKeyPair(existingKeys);
      return;
    }
    const keys = await paillierBigint.generateRandomKeys(1024, true);
    setKeyPair(keys);
    saveKeysLocally(keys, userId);
  };

  const copyPrivateKey = () => {
    if (keyPair) {
      const keyData = {
        n: keyPair.publicKey.n.toString(),
        g: keyPair.publicKey.g.toString(),
        lambda: keyPair.privateKey.lambda.toString(),
        mu: keyPair.privateKey.mu.toString(),
        p: keyPair.privateKey.p ? keyPair.privateKey.p.toString() : null,
        q: keyPair.privateKey.q ? keyPair.privateKey.q.toString() : null
      };
      const backupString = btoa(JSON.stringify(keyData)); 
      navigator.clipboard.writeText(backupString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadBackupFile = () => {
    if (!keyPair) return;
    
    const keyData = {
      n: keyPair.publicKey.n.toString(),
      g: keyPair.publicKey.g.toString(),
      lambda: keyPair.privateKey.lambda.toString(),
      mu: keyPair.privateKey.mu.toString(),
      p: keyPair.privateKey.p ? keyPair.privateKey.p.toString() : null,
      q: keyPair.privateKey.q ? keyPair.privateKey.q.toString() : null
    };
    
    const backupString = btoa(JSON.stringify(keyData));
    
    const blob = new Blob([backupString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SecureMed_Vault_Key_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportWallet = () => {
    try {
      const decoded = atob(importKeyString);
      const parsed = JSON.parse(decoded);
      
      if (!parsed.n || !parsed.lambda) throw new Error("Invalid format");

      const pubKey = new paillierBigint.PublicKey(BigInt(parsed.n), BigInt(parsed.g));
      const privKey = new paillierBigint.PrivateKey(
        BigInt(parsed.lambda), 
        BigInt(parsed.mu), 
        pubKey, 
        parsed.p ? BigInt(parsed.p) : undefined, 
        parsed.q ? BigInt(parsed.q) : undefined
      );

      const restoredKeys = { publicKey: pubKey, privateKey: privKey };
      setKeyPair(restoredKeys);
      saveKeysLocally(restoredKeys, session.user.id);
      
      setWalletMessage({ type: 'success', text: 'Vault restored securely!' });
      setImportKeyString('');
      setTimeout(() => setWalletMessage(null), 3000);
    } catch (e) {
      setWalletMessage({ type: 'error', text: 'Invalid Backup Token. Please check your clipboard.' });
    }
  };

  const userEmail = session?.user?.email || "";
  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : "?";
  const userName = userEmail ? userEmail.split('@')[0] : "Patient";

  const [activeDiseaseTab, setActiveDiseaseTab] = useState('diabetes');
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
    setKeyPair(null);           
    setHistoryRecords([]);      
    setResult(null);            
    setPatientDecrypted(null);  
    setFile(null);              
  };

  useEffect(() => {
    if (mainTab === 'vault' && session) {
      fetchMyHistory();
    }
  }, [mainTab, session]);

  const fetchMyHistory = async () => {
    setIsFetchingHistory(true);
    const { data, error } = await supabase
      .from('patient_history')
      .select('*')
      .eq('patient_id', session.user.id) 
      .order('created_at', { ascending: false });
      
    if (!error && data) setHistoryRecords(data);
    setIsFetchingHistory(false);
  };

  const handleViewReport = async (path, id) => {
    setOpeningFileId(id);
    const { data, error } = await supabase.storage.from('medical_reports').createSignedUrl(path, 60);
    setOpeningFileId(null);

    if (error) {
      alert("Could not access file: " + error.message);
    } else {
      window.open(data.signedUrl, '_blank'); 
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
        setDecryptedHistoryResults(prev => ({ ...prev, [id]: 'Key Mismatch (Data encrypted with an older/different key)' }));
      }
      setDecryptingHistoryId(null);
    }, 1500);
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    const uploadedFile = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
    if (!uploadedFile) return;

    const fileName = uploadedFile.name.toLowerCase();
    const isHeartFile = fileName.includes('heart') || fileName.includes('cardiac') || fileName.includes('lipid');
    const isDiabetesFile = fileName.includes('diabet') || fileName.includes('sugar') || fileName.includes('glucose') || fileName.includes('a1c');

    if (activeDiseaseTab === 'diabetes' && isHeartFile) {
      setResult({ status: 'error', message: 'Report Mismatch: You selected the Diabetes Screen, but uploaded a Cardiac report. Please upload a diabetes-related report or switch tabs.' });
      return;
    }
    if (activeDiseaseTab === 'heart' && isDiabetesFile) {
      setResult({ status: 'error', message: 'Report Mismatch: You selected the Cardiac Screen, but uploaded a Diabetes report. Please upload a cardiac-related report or switch tabs.' });
      return;
    }

    setResult(null); 
    setFile(uploadedFile);
    setIsExtracting(true);
    
    try {
      // ZERO-TRUST extraction: happens entirely in the browser memory
      const extractedData = await extractVitalsFromPDF(uploadedFile, activeDiseaseTab);
      setVitals(extractedData);
    } catch (error) {
      setResult({ status: 'error', message: error.message });
      setFile(null);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAnalysis = async () => {
    setIsAnalyzing(true);
    setResult(null);
    setPatientDecrypted(null); 
    
    if (!keyPair) {
      setResult({ status: 'error', message: 'Cryptographic keys are still generating. Please wait a moment.' });
      setIsAnalyzing(false);
      return;
    }

    if (activeDiseaseTab === 'diabetes' && !vitals.glucose) {
      setResult({ status: 'error', message: 'Missing Data: We could not find required Diabetes metrics (like Glucose or Insulin) in this document. Did you upload the wrong report?' });
      setIsAnalyzing(false);
      return;
    }
    if (activeDiseaseTab === 'heart' && !vitals.h_chol) {
      setResult({ status: 'error', message: 'Missing Data: We could not find required Cardiac metrics (like Cholesterol or Max HR) in this document. Did you upload the wrong report?' });
      setIsAnalyzing(false);
      return;
    }

    try {
      const endpoint = `https://secure-med-cloud.onrender.com/api/predict/${activeDiseaseTab}`;
      
      const rawFeatures = activeDiseaseTab === 'diabetes' 
        ? [vitals.preg, vitals.glucose, vitals.bp, vitals.skin, vitals.insulin, vitals.bmi, vitals.dpf, vitals.age]
        : [vitals.h_age, vitals.h_sex, vitals.h_cp, vitals.h_trestbps, vitals.h_chol, vitals.h_fbs, vitals.h_thalach, vitals.h_exang];
        
      const encryptedFeatures = rawFeatures.map(val => { 
        const safeInt = Math.round(parseFloat(val || 0)); 
        return [keyPair.publicKey.encrypt(BigInt(safeInt)).toString(), 0]; 
      });
      
      const payload = { 
        public_key_n: keyPair.publicKey.n.toString(), 
        encrypted_features: encryptedFeatures 
      };

      const response = await fetch(endpoint, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
      });
      
      if (!response.ok) throw new Error(`Network Error (${response.status}). Is the Python backend running?`);
      
      const data = await response.json();
      
      if (data.status === "error") throw new Error(`Python Logic Error: ${data.message}`);

      if (data.status === "success") {
        
        let finalFilePath = null;
        if (file) {
          const fileExt = file.name.split('.').pop();
          const uniqueFileName = `${session.user.id}/${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('medical_reports')
            .upload(uniqueFileName, file);

          if (uploadError) throw new Error("Secure File Upload Failed: " + uploadError.message);
          finalFilePath = uniqueFileName;
        }

        const { error: dbError } = await supabase.from('patient_history').insert([{
            patient_id: session.user.id, 
            disease_type: activeDiseaseTab,
            encrypted_result: String(data.encrypted_result?.[0] || data.encrypted_result), 
            exponent: data.encrypted_result?.[1] || 0,
            report_file_path: finalFilePath 
        }]);
        
        if (dbError) throw new Error("Supabase Save Failed: " + dbError.message);
        
        setResult({ status: 'success', message: 'Analysis complete.', raw: data });
      } else {
        throw new Error(data.message || "Unknown backend error");
      }
    } catch (error) {
      console.error(error); 
      setResult({ status: 'error', message: error.message });
    } finally { 
      setIsAnalyzing(false); 
    }
  };

  const handlePatientDecrypt = () => {
    setIsPatientDecrypting(true);
    setTimeout(() => {
      try {
        const ciphertext = BigInt(result.raw.encrypted_result[0]);
        const decryptedBigInt = keyPair.privateKey.decrypt(ciphertext);
        const isNegative = decryptedBigInt > (keyPair.publicKey.n / 2n);
        setPatientDecrypted(isNegative ? 'Low Risk' : 'High Risk');
      } catch (err) { setPatientDecrypted('Decryption Error'); } 
      finally { setIsPatientDecrypting(false); }
    }, 1500);
  };

  const resetWorkflow = () => { setFile(null); setResult(null); setPatientDecrypted(null); };

  const handleDiseaseTabSwitch = (tabName) => {
    if (activeDiseaseTab !== tabName) { setActiveDiseaseTab(tabName); resetWorkflow(); }
  };

  function MetricCard({ label, value, unit }) {
    return (
      <div className="bg-white/60 backdrop-blur-sm p-4 rounded-2xl border border-white/50 shadow-sm">
        <p className="text-xs text-gray-600 uppercase tracking-wide font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value || '--'}</p>
        <p className="text-sm text-gray-500">{unit}</p>
      </div>
    );
  }

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center font-sans">
        <p className="text-gray-600 font-semibold animate-pulse">Securing Connection...</p>
      </div>
    );
  }

  if (!session) return <Auth />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER */}
        <div className="bg-white/60 backdrop-blur-xl border border-white/80 shadow-lg rounded-3xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-2xl shadow-inner"><ShieldAlert className="w-8 h-8 text-white" /></div>
            <div>
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">SecureMed Vault</h1>
              <p className="text-sm font-medium text-gray-500">Patient-Owned Zero-Trust Architecture</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3 bg-white/50 px-4 py-2 rounded-2xl border border-white/60 shadow-sm">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-inner">{userInitial}</div>
              <div className="text-sm text-left">
                <p className="text-gray-500 text-[10px] uppercase tracking-wider font-bold">Logged In</p>
                <p className="text-gray-800 font-bold leading-tight truncate max-w-[100px]">{userName}</p>
              </div>
              <button onClick={() => setShowWallet(true)} className="ml-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 p-1.5 rounded-xl transition-all" title="Manage Keys"><Wallet className="w-4 h-4" /></button>
            </div>

            <div className="flex items-center gap-2 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-200/50">
              <button onClick={() => setMainTab('upload')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${mainTab === 'upload' ? 'bg-white text-indigo-700 shadow-sm border border-white' : 'text-gray-600 hover:text-gray-900'}`}><UploadCloud className="w-4 h-4"/> New</button>
              <button onClick={() => setMainTab('vault')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${mainTab === 'vault' ? 'bg-white text-purple-700 shadow-sm border border-white' : 'text-gray-600 hover:text-gray-900'}`}><Database className="w-4 h-4"/> Vault</button>
              <button onClick={handleSignOut} className="ml-2 px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-bold transition-all" title="Sign Out"><LogOut className="w-4 h-4"/></button>
            </div>
          </div>
        </div>

        {/* UPLOAD TAB */}
        {mainTab === 'upload' && (
          <div className="bg-white/40 backdrop-blur-xl border border-white/50 shadow-2xl rounded-3xl p-6 md:p-10 w-full animate-in fade-in slide-in-from-bottom-4">
            <div className="flex gap-4 mb-8 bg-white/50 p-1.5 rounded-2xl w-fit mx-auto border border-white/60">
              <button onClick={() => handleDiseaseTabSwitch('diabetes')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeDiseaseTab === 'diabetes' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}><Activity className="w-4 h-4"/> Diabetes Screen</button>
              <button onClick={() => handleDiseaseTabSwitch('heart')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeDiseaseTab === 'heart' ? 'bg-white shadow-sm text-red-500' : 'text-gray-600 hover:text-gray-900'}`}><Heart className="w-4 h-4"/> Cardiac Screen</button>
            </div>

            {!file && (
              <div onDragOver={(e) => e.preventDefault()} onDrop={handleFileUpload} className="border-2 border-dashed border-indigo-300/50 rounded-3xl p-16 text-center hover:bg-white/40 transition-all cursor-pointer bg-white/20">
                <input type="file" id="fileUpload" className="hidden" onChange={handleFileUpload} accept=".pdf" />
                <label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center">
                  <div className="bg-indigo-100 p-4 rounded-full mb-4"><UploadCloud className="w-10 h-10 text-indigo-600" /></div>
                  <p className="text-xl font-bold text-gray-800">Upload Blood Report</p>
                  <p className="text-sm text-gray-500 mt-2 font-medium">Drag & drop your medical PDF here</p>
                </label>
              </div>
            )}

            {isExtracting && (
              <div className="py-16 text-center">
                <div className="relative w-20 h-20 mx-auto mb-6"><div className="absolute inset-0 border-4 border-indigo-200 rounded-full"></div><div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div><FileText className="absolute inset-0 m-auto w-8 h-8 text-indigo-600 animate-pulse" /></div>
                <p className="font-bold text-gray-800 text-lg">Running Local PDF Extraction...</p>
              </div>
            )}

            {file && !isExtracting && (
              <div className="animate-in fade-in duration-500">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-extrabold text-gray-800">Extracted Vitals</h3>
                  <button onClick={() => { setFile(null); setResult(null); }} className="text-sm font-bold text-indigo-600 hover:text-indigo-800">Upload Different File</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  {activeDiseaseTab === 'diabetes' ? (
                    <><MetricCard label="Glucose" value={vitals.glucose} unit="mg/dL" /><MetricCard label="Blood Pressure" value={vitals.bp} unit="mmHg" /><MetricCard label="BMI" value={vitals.bmi} unit="kg/m²" /><MetricCard label="Insulin" value={vitals.insulin} unit="μU/ml" /></>
                  ) : (
                    <><MetricCard label="Resting BP" value={vitals.h_trestbps} unit="mmHg" /><MetricCard label="Cholesterol" value={vitals.h_chol} unit="mg/dL" /><MetricCard label="Max HR" value={vitals.h_thalach} unit="bpm" /><MetricCard label="Fasting Sugar" value={vitals.h_fbs} unit=">120" /></>
                  )}
                </div>
                <button onClick={handleAnalysis} disabled={isAnalyzing || !keyPair} className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-xl transition-all disabled:opacity-70 flex justify-center items-center gap-3 text-lg">
                  {isAnalyzing ? <><span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span> Encrypting & Analyzing...</> : <><ShieldAlert className="w-5 h-5"/> Run Secure Homomorphic Analysis</>}
                </button>
              </div>
            )}

            {result && result.status === 'error' && (
              <div className="mt-8 bg-red-50/80 border border-red-200 p-6 rounded-3xl animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 mb-4 border-b border-red-200 pb-4">
                  <XCircle className="text-red-600 w-8 h-8" />
                  <div>
                    <p className="font-bold text-red-900 text-lg">System Alert: Architecture Blocked</p>
                    <p className="text-sm text-red-700">The Homomorphic pipeline encountered an issue.</p>
                  </div>
                </div>
                <div className="bg-white/60 p-4 rounded-xl border border-red-100">
                  <p className="font-mono text-sm text-red-800 font-bold">Trace:</p>
                  <p className="font-mono text-sm text-red-600 mt-1">{result.message}</p>
                </div>
                <button onClick={() => setResult(null)} className="mt-6 w-full bg-red-100 hover:bg-red-200 text-red-800 font-bold py-3 rounded-xl transition-all shadow-sm">
                  Acknowledge & Retry
                </button>
              </div>
            )}

            {result && result.status === 'success' && (
              <div className="mt-8 bg-green-50/80 border border-green-200 p-6 rounded-3xl animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-green-200"><CheckCircle2 className="text-green-600 w-8 h-8" /><div><p className="font-bold text-green-900 text-lg">Cloud Analysis Complete</p><p className="text-sm text-green-700">Encrypted data secured in your personal vault.</p></div></div>
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex-1 w-full min-w-0">
                    <p className="text-xs font-bold text-green-800 uppercase tracking-wider mb-2 flex items-center gap-1"><Database className="w-3 h-3"/> Encrypted Payload</p>
                    <p className="font-mono text-xs bg-gray-900 text-green-400 p-4 rounded-2xl break-all line-clamp-3 shadow-inner">{result.raw?.encrypted_result?.[0] || result.raw?.encrypted_result}</p>
                  </div>
                  <div className="w-full md:w-auto flex flex-col items-center justify-center min-w-[200px]">
                    {!patientDecrypted ? (
                      <button onClick={handlePatientDecrypt} disabled={isPatientDecrypting} className="w-full bg-white hover:bg-gray-50 text-green-800 border border-green-300 px-6 py-4 rounded-2xl font-black transition-all shadow-md disabled:opacity-70 flex items-center justify-center gap-2">
                        {isPatientDecrypting ? 'Applying Key...' : <><Key className="w-5 h-5"/> Apply My Private Key</>}
                      </button>
                    ) : (
                      <div className={`w-full text-center px-8 py-4 rounded-2xl border-2 shadow-sm ${patientDecrypted === 'High Risk' ? 'bg-red-50 border-red-200' : 'bg-green-100 border-green-400'}`}>
                        <span className="text-xs font-bold uppercase block mb-1 text-gray-500">Local Decryption</span>
                        <span className={`text-2xl font-black ${patientDecrypted === 'High Risk' ? 'text-red-600' : 'text-green-700'}`}>{patientDecrypted}</span>
                      </div>
                    )}
                  </div>
                </div>
                {patientDecrypted && <button onClick={resetWorkflow} className="mt-6 w-full bg-white/50 hover:bg-white text-green-800 font-bold py-3 rounded-xl transition-all">Start New Analysis</button>}
              </div>
            )}
          </div>
        )}

        {/* VAULT TAB */}
        {mainTab === 'vault' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-8">
            <div className="bg-purple-100/50 border border-purple-200 p-6 rounded-3xl flex items-start gap-4">
              <Key className="w-6 h-6 text-purple-600 shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-purple-900 text-lg">Your Cryptographic Vault</h3>
                <p className="text-purple-700 text-sm mt-1">Stored homomorphically encrypted in the cloud. You are the only person who holds the private key (stored securely in your browser cache) to reveal the actual diagnosis.</p>
              </div>
            </div>

            {isFetchingHistory ? (
              <div className="text-center py-12 text-gray-500 font-medium animate-pulse">Accessing Vault...</div>
            ) : historyRecords.length === 0 ? (
              <div className="text-center py-16 bg-white/40 border border-white/60 rounded-3xl"><Database className="w-12 h-12 text-gray-400 mx-auto mb-3" /><p className="font-bold text-gray-600">Your vault is empty.</p></div>
            ) : (
              historyRecords.map((record) => (
                <div key={record.id} className="bg-white/60 backdrop-blur-xl border border-white/80 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row gap-6 relative group">
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${record.disease_type === 'diabetes' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                        {record.disease_type === 'diabetes' ? <Activity className="w-3 h-3"/> : <Heart className="w-3 h-3"/>} {record.disease_type} Screen
                      </span>
                      <span className="text-xs font-medium text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3"/> {new Date(record.created_at).toLocaleDateString()}</span>
                      
                      {record.report_file_path && (
                        <button 
                          onClick={() => handleViewReport(record.report_file_path, record.id)}
                          disabled={openingFileId === record.id}
                          className="ml-auto text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 border border-indigo-100"
                        >
                          {openingFileId === record.id ? 'Securing Link...' : <><ExternalLink className="w-3 h-3"/> Original Report</>}
                        </button>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Encrypted Ciphertext</p>
                      <p className="font-mono text-xs bg-gray-900 text-green-400 p-3 rounded-xl break-all line-clamp-2 border border-gray-700 shadow-inner">{record.encrypted_result}</p>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center min-w-[200px]">
                    {!decryptedHistoryResults[record.id] ? (
                      <button onClick={() => handleHistoryDecrypt(record.id)} disabled={decryptingHistoryId === record.id} className="w-full bg-gray-900 hover:bg-black text-white px-5 py-4 rounded-2xl font-bold transition-all shadow-md disabled:opacity-70 flex justify-center items-center gap-2">
                        {decryptingHistoryId === record.id ? 'Decrypting...' : <><Key className="w-4 h-4"/> Apply Private Key</>}
                      </button>
                    ) : (
                      <div className={`w-full text-center px-6 py-3 rounded-2xl border-2 ${decryptedHistoryResults[record.id] === 'High Risk' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Decrypted Diagnosis</span>
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative">
            <button onClick={() => setShowWallet(false)} className="absolute top-6 right-6 text-gray-400 hover:text-gray-900 transition-colors"><X className="w-6 h-6" /></button>
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600"><Wallet className="w-8 h-8" /></div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Your Crypto Wallet</h2>
                <p className="text-sm text-gray-500">Manage your device-locked keys</p>
              </div>
            </div>

            {walletMessage && (
              <div className={`mb-4 p-3 rounded-xl text-sm font-medium ${walletMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {walletMessage.text}
              </div>
            )}
            
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 mb-6">
              <p className="text-sm font-bold text-gray-700 mb-2">1. Backup Vault Key</p>
              <p className="text-xs text-gray-500 mb-4">Your key is locked to this browser. You must save this token to recover your history on a new device. Absolute privacy means absolute responsibility.</p>
              
              <div className="flex gap-3 mt-4">
                <button 
                  onClick={copyPrivateKey} 
                  className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 p-3 rounded-xl transition-all font-bold text-sm flex items-center justify-center gap-2"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy Text"}
                </button>
                
                <button 
                  onClick={downloadBackupFile} 
                  className="flex-1 bg-gray-900 hover:bg-black text-white p-3 rounded-xl transition-all font-bold text-sm flex items-center justify-center gap-2 shadow-md"
                >
                  <Download className="w-4 h-4" />
                  Download Key File
                </button>
              </div>
            </div>

            <div className="bg-indigo-50/50 rounded-2xl p-5 border border-indigo-100 mb-6">
              <p className="text-sm font-bold text-indigo-900 mb-2">2. Restore Existing Vault</p>
              <p className="text-xs text-indigo-700/70 mb-3">Switching devices? Paste your backup token here to regain access to your old records.</p>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={importKeyString}
                  onChange={(e) => setImportKeyString(e.target.value)}
                  placeholder="Paste backup token here..." 
                  className="flex-1 text-xs px-4 py-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button 
                  onClick={handleImportWallet}
                  disabled={!importKeyString}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 rounded-xl font-bold text-sm transition-all flex items-center gap-2"
                >
                  <Download className="w-4 h-4"/> Restore
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}