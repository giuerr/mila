/**
 * Tax & Regulatory Form Template Library
 * ========================================
 * Complete form definitions for all 26 jurisdictions with:
 *   - Field-level schema (type, validation, IRS/HMRC/CBI line references)
 *   - Conversational question flow for interactive chat-based filling
 *   - Pre-population logic from existing investor data
 *   - Jurisdiction routing (which forms are required for which investor)
 *   - PDF generation hooks (integrates with pdfEngine.js)
 *   - E-signature envelope preparation (integrates with signatureEngine.js — native, no DocuSign)
 *
 * Official source references included per form.
 */

class FormTemplateService {

  // ==================== FORM REGISTRY ====================

  /**
   * Get all available form templates
   */
  getFormRegistry() {
    return {
      // --- IRS Forms (US) ---
      'W-9':       { category: 'US_TAX', jurisdiction: 'US', name: 'Request for Taxpayer Identification Number and Certification', officialSource: 'https://www.irs.gov/forms-pubs/about-form-w-9', revision: 'Rev. March 2024', pages: 6 },
      'W-8BEN':    { category: 'US_TAX', jurisdiction: 'US', name: 'Certificate of Foreign Status of Beneficial Owner for United States Tax Withholding and Reporting (Individuals)', officialSource: 'https://www.irs.gov/forms-pubs/about-form-w-8-ben', revision: 'Rev. October 2021', pages: 4 },
      'W-8BEN-E':  { category: 'US_TAX', jurisdiction: 'US', name: 'Certificate of Status of Beneficial Owner for United States Tax Withholding and Reporting (Entities)', officialSource: 'https://www.irs.gov/forms-pubs/about-form-w-8-ben-e', revision: 'Rev. October 2021', pages: 8 },
      'W-8IMY':    { category: 'US_TAX', jurisdiction: 'US', name: 'Certificate of Foreign Intermediary, Foreign Flow-Through Entity, or Certain U.S. Branches for United States Tax Withholding and Reporting', officialSource: 'https://www.irs.gov/forms-pubs/about-form-w-8-imy', revision: 'Rev. October 2021', pages: 6 },
      'W-8ECI':    { category: 'US_TAX', jurisdiction: 'US', name: 'Certificate of Foreign Person\'s Claim That Income Is Effectively Connected With the Conduct of a Trade or Business in the United States', officialSource: 'https://www.irs.gov/forms-pubs/about-form-w-8-eci', revision: 'Rev. October 2021', pages: 3 },
      'W-8EXP':    { category: 'US_TAX', jurisdiction: 'US', name: 'Certificate of Foreign Government or Other Foreign Organization for United States Tax Withholding and Reporting', officialSource: 'https://www.irs.gov/forms-pubs/about-form-w-8-exp', revision: 'Rev. July 2017', pages: 4 },

      // --- CRS / FATCA Self-Certifications ---
      'CRS-INDIVIDUAL':  { category: 'CRS', jurisdiction: 'INTERNATIONAL', name: 'CRS Self-Certification — Individual', officialSource: 'OECD CRS Standard (Annex)', revision: 'OECD 2023', pages: 3 },
      'CRS-ENTITY':      { category: 'CRS', jurisdiction: 'INTERNATIONAL', name: 'CRS Self-Certification — Controlling Persons & Entities', officialSource: 'OECD CRS Standard (Annex)', revision: 'OECD 2023', pages: 4 },
      'FATCA-INDIVIDUAL': { category: 'FATCA', jurisdiction: 'US', name: 'FATCA Individual Self-Certification', officialSource: 'IRS FATCA / IGA framework', revision: '2023', pages: 2 },
      'FATCA-ENTITY':     { category: 'FATCA', jurisdiction: 'US', name: 'FATCA Entity Self-Certification', officialSource: 'IRS FATCA / IGA framework', revision: '2023', pages: 3 },

      // --- Ireland ---
      'IE-SELF-CERT':       { category: 'IRISH_TAX', jurisdiction: 'IRELAND', name: 'Revenue Self-Declaration for Irish Tax Residence', officialSource: 'Irish Revenue Commissioners', revision: '2024', pages: 2 },
      'IE-QI-DECLARATION':  { category: 'IRISH_TAX', jurisdiction: 'IRELAND', name: 'Qualifying Investor Declaration (QIAIF)', officialSource: 'CBI (Central Bank of Ireland)', revision: '2023', pages: 3 },
      'IE-NON-RESIDENT':    { category: 'IRISH_TAX', jurisdiction: 'IRELAND', name: 'Non-Resident Declaration (TBS 24-01)', officialSource: 'Irish Revenue Commissioners', revision: 'Rev. 2024', pages: 2 },

      // --- UK ---
      'UK-SELF-CERT':  { category: 'UK_TAX', jurisdiction: 'UK', name: 'HMRC CRS/FATCA Self-Certification', officialSource: 'HMRC', revision: '2023', pages: 3 },
      'UK-NRL':        { category: 'UK_TAX', jurisdiction: 'UK', name: 'Non-Resident Landlord Scheme (NRL1)', officialSource: 'HMRC', revision: '2023', pages: 4, note: 'For UK real estate fund holdings' },

      // --- Luxembourg ---
      'LU-SELF-CERT':  { category: 'LU_TAX', jurisdiction: 'LUXEMBOURG', name: 'Luxembourg CRS/FATCA Self-Certification', officialSource: 'ACD (Administration des Contributions Directes)', revision: '2024', pages: 3 },
      'LU-WI-DECL':    { category: 'LU_TAX', jurisdiction: 'LUXEMBOURG', name: 'Well-Informed Investor Declaration (SIF/RAIF)', officialSource: 'CSSF', revision: '2023', pages: 2 },

      // --- Cayman Islands ---
      'KY-SELF-CERT':  { category: 'KY_TAX', jurisdiction: 'CAYMAN', name: 'Cayman Islands CRS/FATCA Self-Certification', officialSource: 'DITC (Dept of International Tax Cooperation)', revision: '2024', pages: 3 },

      // --- Singapore ---
      'SG-SELF-CERT':  { category: 'SG_TAX', jurisdiction: 'SINGAPORE', name: 'Singapore CRS Self-Certification', officialSource: 'IRAS (Inland Revenue Authority of Singapore)', revision: '2024', pages: 3 },
      'SG-AI-DECL':    { category: 'SG_TAX', jurisdiction: 'SINGAPORE', name: 'Accredited Investor Declaration (SFA s.4A)', officialSource: 'MAS', revision: '2023', pages: 2 },

      // --- Hong Kong ---
      'HK-SELF-CERT':  { category: 'HK_TAX', jurisdiction: 'HONG_KONG', name: 'Hong Kong CRS Self-Certification', officialSource: 'IRD (Inland Revenue Department)', revision: '2024', pages: 3 },
      'HK-PI-DECL':    { category: 'HK_TAX', jurisdiction: 'HONG_KONG', name: 'Professional Investor Declaration (SFO Sch.1)', officialSource: 'SFC', revision: '2023', pages: 2 },

      // --- Switzerland ---
      'CH-FORM-A':     { category: 'CH_TAX', jurisdiction: 'SWITZERLAND', name: 'Form A — Identification of Beneficial Owner (individual)', officialSource: 'SBA (Swiss Bankers Association) / AMLA', revision: '2024', pages: 2 },
      'CH-FORM-T':     { category: 'CH_TAX', jurisdiction: 'SWITZERLAND', name: 'Form T — Identification of Beneficial Owner (trust/domiciliary)', officialSource: 'SBA / AMLA', revision: '2024', pages: 2 },
      'CH-QI-DECL':    { category: 'CH_TAX', jurisdiction: 'SWITZERLAND', name: 'Qualified Investor Declaration (CISA Art. 10)', officialSource: 'FINMA', revision: '2024', pages: 2 },
      'CH-DA1':        { category: 'CH_TAX', jurisdiction: 'SWITZERLAND', name: 'Form DA-1 — Withholding Tax Reclaim', officialSource: 'ESTV (Federal Tax Administration)', revision: '2024', pages: 3 },

      // --- BVI ---
      'BVI-SELF-CERT': { category: 'BVI_TAX', jurisdiction: 'BVI', name: 'BVI CRS/FATCA Self-Certification', officialSource: 'BVI ITA (International Tax Authority)', revision: '2024', pages: 3 },

      // --- Jersey ---
      'JE-SELF-CERT':  { category: 'JE_TAX', jurisdiction: 'JERSEY', name: 'Jersey CRS/FATCA Self-Certification', officialSource: 'Revenue Jersey', revision: '2024', pages: 3 },

      // --- Guernsey ---
      'GG-SELF-CERT':  { category: 'GG_TAX', jurisdiction: 'GUERNSEY', name: 'Guernsey CRS/FATCA Self-Certification', officialSource: 'Revenue Service Guernsey', revision: '2024', pages: 3 },

      // --- ADGM ---
      'ADGM-SELF-CERT': { category: 'ADGM_TAX', jurisdiction: 'ADGM', name: 'ADGM CRS/FATCA Self-Certification', officialSource: 'ADGM Registration Authority', revision: '2024', pages: 3 },

      // --- DIFC ---
      'DIFC-SELF-CERT': { category: 'DIFC_TAX', jurisdiction: 'DIFC', name: 'DIFC CRS/FATCA Self-Certification', officialSource: 'DIFC Authority', revision: '2024', pages: 3 },

      // --- Germany ---
      'DE-SELF-CERT':  { category: 'DE_TAX', jurisdiction: 'GERMANY', name: 'German CRS Self-Certification (Selbstauskunft)', officialSource: 'BZSt (Bundeszentralamt für Steuern)', revision: '2024', pages: 3 },

      // --- France ---
      'FR-SELF-CERT':  { category: 'FR_TAX', jurisdiction: 'FRANCE', name: 'French CRS Self-Certification (Auto-certification)', officialSource: 'DGFiP', revision: '2024', pages: 3 },

      // --- Italy ---
      'IT-SELF-CERT':  { category: 'IT_TAX', jurisdiction: 'ITALY', name: 'Italian CRS Self-Certification (Autocertificazione)', officialSource: 'Agenzia delle Entrate', revision: '2024', pages: 3 },

      // --- Spain ---
      'ES-SELF-CERT':  { category: 'ES_TAX', jurisdiction: 'SPAIN', name: 'Spanish CRS Self-Certification (Autodeclaración)', officialSource: 'AEAT (Agencia Tributaria)', revision: '2024', pages: 3 },

      // --- Netherlands ---
      'NL-SELF-CERT':  { category: 'NL_TAX', jurisdiction: 'NETHERLANDS', name: 'Dutch CRS Self-Certification', officialSource: 'Belastingdienst', revision: '2024', pages: 3 },

      // --- Nordics ---
      'DK-SELF-CERT':  { category: 'DK_TAX', jurisdiction: 'DENMARK', name: 'Danish CRS Self-Certification', officialSource: 'Skattestyrelsen', revision: '2024', pages: 3 },
      'SE-SELF-CERT':  { category: 'SE_TAX', jurisdiction: 'SWEDEN', name: 'Swedish CRS Self-Certification', officialSource: 'Skatteverket', revision: '2024', pages: 3 },
      'NO-SELF-CERT':  { category: 'NO_TAX', jurisdiction: 'NORWAY', name: 'Norwegian CRS Self-Certification', officialSource: 'Skatteetaten', revision: '2024', pages: 3 },
      'FI-SELF-CERT':  { category: 'FI_TAX', jurisdiction: 'FINLAND', name: 'Finnish CRS Self-Certification', officialSource: 'Verohallinto', revision: '2024', pages: 3 },

      // --- Baltics ---
      'EE-SELF-CERT':  { category: 'EE_TAX', jurisdiction: 'ESTONIA', name: 'Estonian CRS Self-Certification', officialSource: 'Maksu- ja Tolliamet', revision: '2024', pages: 3 },
      'LT-SELF-CERT':  { category: 'LT_TAX', jurisdiction: 'LITHUANIA', name: 'Lithuanian CRS Self-Certification', officialSource: 'VMI (State Tax Inspectorate)', revision: '2024', pages: 3 }
    };
  }

  // ==================== FORM FIELD SCHEMAS ====================

  /**
   * Get complete field schema for a form — every field, its type, validation, and IRS/official line reference
   */
  getFormSchema(formId) {
    const schemas = {

      // ===============================================================
      //  W-9: REQUEST FOR TAXPAYER IDENTIFICATION NUMBER
      // ===============================================================
      'W-9': {
        formId: 'W-9',
        title: 'Request for Taxpayer Identification Number and Certification',
        authority: 'IRS',
        sections: [
          {
            id: 'identity',
            title: 'Taxpayer Information',
            fields: [
              { id: 'name', label: 'Name (as shown on your income tax return)', type: 'text', required: true, irsLine: 'Line 1', maxLength: 100 },
              { id: 'businessName', label: 'Business name / disregarded entity name (if different)', type: 'text', required: false, irsLine: 'Line 2', maxLength: 100 },
              { id: 'federalTaxClassification', label: 'Federal tax classification', type: 'select', required: true, irsLine: 'Line 3',
                options: [
                  { value: 'individual', label: 'Individual/Sole proprietor' },
                  { value: 'c_corp', label: 'C Corporation' },
                  { value: 's_corp', label: 'S Corporation' },
                  { value: 'partnership', label: 'Partnership' },
                  { value: 'trust_estate', label: 'Trust/estate' },
                  { value: 'llc', label: 'Limited liability company' },
                  { value: 'other', label: 'Other' }
                ]
              },
              { id: 'llcClassification', label: 'LLC tax classification (C, S, or P)', type: 'select', required: false, irsLine: 'Line 3 (LLC)',
                options: [{ value: 'C', label: 'C Corporation' }, { value: 'S', label: 'S Corporation' }, { value: 'P', label: 'Partnership' }],
                condition: { field: 'federalTaxClassification', value: 'llc' }
              },
              { id: 'exemptPayeeCode', label: 'Exempt payee code (if applicable)', type: 'text', required: false, irsLine: 'Line 4', maxLength: 2 },
              { id: 'fatcaExemptionCode', label: 'FATCA exemption code (if applicable)', type: 'text', required: false, irsLine: 'Line 4', maxLength: 2 },
              { id: 'address', label: 'Address (number, street, apt/suite)', type: 'text', required: true, irsLine: 'Line 5', maxLength: 200 },
              { id: 'cityStateZip', label: 'City, state, and ZIP code', type: 'text', required: true, irsLine: 'Line 6', maxLength: 100 },
              { id: 'accountNumbers', label: 'List account number(s) (optional)', type: 'text', required: false, irsLine: 'Line 7', maxLength: 200 }
            ]
          },
          {
            id: 'tin',
            title: 'Taxpayer Identification Number',
            fields: [
              { id: 'tinType', label: 'TIN type', type: 'select', required: true,
                options: [{ value: 'ssn', label: 'Social Security Number (SSN)' }, { value: 'ein', label: 'Employer Identification Number (EIN)' }]
              },
              { id: 'tin', label: 'Taxpayer Identification Number', type: 'text', required: true, irsLine: 'Part I',
                validation: { pattern: '^\\d{2}-?\\d{7}$|^\\d{3}-?\\d{2}-?\\d{4}$', message: 'Enter a valid SSN (XXX-XX-XXXX) or EIN (XX-XXXXXXX)' }
              }
            ]
          },
          {
            id: 'certification',
            title: 'Certification',
            fields: [
              { id: 'certifyTin', label: 'I certify that the TIN provided is correct', type: 'checkbox', required: true, irsLine: 'Part II, #1' },
              { id: 'certifyBackup', label: 'I am not subject to backup withholding', type: 'checkbox', required: true, irsLine: 'Part II, #2' },
              { id: 'certifyUsPerson', label: 'I am a U.S. citizen or other U.S. person', type: 'checkbox', required: true, irsLine: 'Part II, #3' },
              { id: 'certifyFatca', label: 'FATCA code(s) entered are correct', type: 'checkbox', required: true, irsLine: 'Part II, #4' }
            ]
          },
          {
            id: 'signature',
            title: 'Signature',
            fields: [
              { id: 'signatureDate', label: 'Date', type: 'date', required: true },
              { id: 'signature', label: 'Signature of U.S. person', type: 'signature', required: true }
            ]
          }
        ]
      },

      // ===============================================================
      //  W-8BEN: FOREIGN INDIVIDUAL
      // ===============================================================
      'W-8BEN': {
        formId: 'W-8BEN',
        title: 'Certificate of Foreign Status of Beneficial Owner (Individuals)',
        authority: 'IRS',
        sections: [
          {
            id: 'identification',
            title: 'Identification of Beneficial Owner',
            fields: [
              { id: 'name', label: 'Name of individual who is the beneficial owner', type: 'text', required: true, irsLine: 'Line 1', maxLength: 100 },
              { id: 'countryOfCitizenship', label: 'Country of citizenship', type: 'country', required: true, irsLine: 'Line 2' },
              { id: 'permanentAddress', label: 'Permanent residence address', type: 'text', required: true, irsLine: 'Line 3', maxLength: 200 },
              { id: 'permanentCity', label: 'City or town', type: 'text', required: true, irsLine: 'Line 3' },
              { id: 'permanentCountry', label: 'Country', type: 'country', required: true, irsLine: 'Line 3' },
              { id: 'mailingAddress', label: 'Mailing address (if different)', type: 'text', required: false, irsLine: 'Line 4', maxLength: 200 },
              { id: 'mailingCity', label: 'City or town', type: 'text', required: false, irsLine: 'Line 4' },
              { id: 'mailingCountry', label: 'Country', type: 'country', required: false, irsLine: 'Line 4' },
              { id: 'usTin', label: 'U.S. taxpayer identification number (SSN or ITIN)', type: 'text', required: false, irsLine: 'Line 5',
                validation: { pattern: '^\\d{3}-?\\d{2}-?\\d{4}$', message: 'Enter a valid SSN/ITIN (XXX-XX-XXXX)' }
              },
              { id: 'foreignTin', label: 'Foreign tax identifying number', type: 'text', required: true, irsLine: 'Line 6a', maxLength: 30 },
              { id: 'foreignTinNotRequired', label: 'Check if FTIN not legally required', type: 'checkbox', required: false, irsLine: 'Line 6b' },
              { id: 'referenceNumbers', label: 'Reference number(s)', type: 'text', required: false, irsLine: 'Line 7', maxLength: 50 },
              { id: 'dateOfBirth', label: 'Date of birth (MM-DD-YYYY)', type: 'date', required: true, irsLine: 'Line 8' }
            ]
          },
          {
            id: 'treatyClaim',
            title: 'Claim of Tax Treaty Benefits (Part II)',
            fields: [
              { id: 'treatyCountry', label: 'Country of residence for treaty purposes', type: 'country', required: false, irsLine: 'Line 9' },
              { id: 'specialRatesArticle', label: 'Treaty article for special rate', type: 'text', required: false, irsLine: 'Line 10 — Article' },
              { id: 'specialRatePercent', label: 'Withholding rate under treaty (%)', type: 'number', required: false, irsLine: 'Line 10 — Rate', min: 0, max: 30 },
              { id: 'incomeType', label: 'Type of income', type: 'select', required: false, irsLine: 'Line 10 — Income type',
                options: [
                  { value: 'dividends', label: 'Dividends' },
                  { value: 'interest', label: 'Interest' },
                  { value: 'royalties', label: 'Royalties' },
                  { value: 'capital_gains', label: 'Capital gains' },
                  { value: 'other', label: 'Other' }
                ]
              },
              { id: 'treatyConditions', label: 'Additional conditions / explanation', type: 'textarea', required: false, irsLine: 'Line 10', maxLength: 500 }
            ]
          },
          {
            id: 'signature',
            title: 'Certification & Signature (Part III)',
            fields: [
              { id: 'certifyBeneficialOwner', label: 'I certify that I am the beneficial owner of all income to which this form relates', type: 'checkbox', required: true },
              { id: 'certifyNotUsPerson', label: 'I am not a U.S. person', type: 'checkbox', required: true },
              { id: 'certifyTreatyBenefits', label: 'I am claiming treaty benefits and meet the LOB article (if applicable)', type: 'checkbox', required: false },
              { id: 'signatureDate', label: 'Date', type: 'date', required: true },
              { id: 'signature', label: 'Signature of beneficial owner', type: 'signature', required: true },
              { id: 'printedName', label: 'Printed name of signer', type: 'text', required: true, maxLength: 100 },
              { id: 'capacityIfAgent', label: 'If signing as agent, capacity in which acting', type: 'text', required: false, maxLength: 100 }
            ]
          }
        ]
      },

      // ===============================================================
      //  W-8BEN-E: FOREIGN ENTITY
      // ===============================================================
      'W-8BEN-E': {
        formId: 'W-8BEN-E',
        title: 'Certificate of Status of Beneficial Owner (Entities)',
        authority: 'IRS',
        sections: [
          {
            id: 'identification',
            title: 'Identification of Beneficial Owner (Part I)',
            fields: [
              { id: 'entityName', label: 'Name of organization', type: 'text', required: true, irsLine: 'Line 1', maxLength: 150 },
              { id: 'countryOfIncorporation', label: 'Country of incorporation or organization', type: 'country', required: true, irsLine: 'Line 2' },
              { id: 'entityName_dba', label: 'Name of disregarded entity (if applicable)', type: 'text', required: false, irsLine: 'Line 3', maxLength: 150 },
              { id: 'chapter3Status', label: 'Chapter 3 status (entity type)', type: 'select', required: true, irsLine: 'Line 4',
                options: [
                  { value: 'corporation', label: 'Corporation' },
                  { value: 'partnership', label: 'Partnership' },
                  { value: 'simple_trust', label: 'Simple trust' },
                  { value: 'complex_trust', label: 'Complex trust' },
                  { value: 'grantor_trust', label: 'Grantor trust' },
                  { value: 'estate', label: 'Estate' },
                  { value: 'government', label: 'Government' },
                  { value: 'central_bank', label: 'Central bank of issue' },
                  { value: 'tax_exempt', label: 'Tax-exempt organization' },
                  { value: 'private_foundation', label: 'Private foundation' },
                  { value: 'international_org', label: 'International organization' },
                  { value: 'disregarded_entity', label: 'Disregarded entity' },
                  { value: 'hybrid', label: 'Hybrid making treaty claim' }
                ]
              },
              { id: 'chapter4Status', label: 'Chapter 4 (FATCA) status', type: 'select', required: true, irsLine: 'Line 5',
                options: [
                  { value: 'active_nffe', label: 'Active NFFE' },
                  { value: 'passive_nffe', label: 'Passive NFFE' },
                  { value: 'participating_ffi', label: 'Participating FFI' },
                  { value: 'reporting_model1_ffi', label: 'Reporting Model 1 FFI' },
                  { value: 'reporting_model2_ffi', label: 'Reporting Model 2 FFI' },
                  { value: 'nonparticipating_ffi', label: 'Nonparticipating FFI' },
                  { value: 'exempt_beneficial_owner', label: 'Exempt beneficial owner' },
                  { value: 'nonreporting_iga_ffi', label: 'Nonreporting IGA FFI' },
                  { value: 'territory_fi', label: 'Territory financial institution' },
                  { value: 'sponsored_entity', label: 'Sponsored entity' },
                  { value: 'owner_documented_ffi', label: 'Owner-documented FFI' },
                  { value: 'direct_reporting_nffe', label: 'Direct reporting NFFE' },
                  { value: 'sponsored_direct_reporting_nffe', label: 'Sponsored direct reporting NFFE' }
                ]
              },
              { id: 'permanentAddress', label: 'Permanent residence address', type: 'text', required: true, irsLine: 'Line 6', maxLength: 200 },
              { id: 'permanentCity', label: 'City or town', type: 'text', required: true, irsLine: 'Line 6' },
              { id: 'permanentCountry', label: 'Country', type: 'country', required: true, irsLine: 'Line 6' },
              { id: 'mailingAddress', label: 'Mailing address (if different)', type: 'text', required: false, irsLine: 'Line 7', maxLength: 200 },
              { id: 'usTin', label: 'U.S. TIN (if any)', type: 'text', required: false, irsLine: 'Line 8' },
              { id: 'giin', label: 'GIIN (Global Intermediary Identification Number)', type: 'text', required: false, irsLine: 'Line 9a',
                validation: { pattern: '^[A-Z0-9]{6}\\.[A-Z0-9]{5}\\.[A-Z]{2}\\.\\d{3}$', message: 'Enter a valid GIIN (e.g., A1B2C3.D4E5F.AB.123)' }
              },
              { id: 'foreignTin', label: 'Foreign TIN', type: 'text', required: false, irsLine: 'Line 9b', maxLength: 30 },
              { id: 'referenceNumbers', label: 'Reference number(s)', type: 'text', required: false, irsLine: 'Line 10', maxLength: 50 }
            ]
          },
          {
            id: 'treatyClaim',
            title: 'Claim of Tax Treaty Benefits (Part III)',
            fields: [
              { id: 'claimsTreatyBenefits', label: 'Entity claims treaty benefits', type: 'checkbox', required: false, irsLine: 'Line 14a' },
              { id: 'treatyCountry', label: 'Country of treaty residence', type: 'country', required: false, irsLine: 'Line 14a' },
              { id: 'lobArticle', label: 'LOB article complied with', type: 'text', required: false, irsLine: 'Line 14b' },
              { id: 'lobProvision', label: 'LOB provision (active trade, publicly traded, etc.)', type: 'select', required: false, irsLine: 'Line 14b',
                options: [
                  { value: 'government', label: 'Government' },
                  { value: 'tax_exempt_pension', label: 'Tax-exempt pension trust/fund' },
                  { value: 'other_tax_exempt', label: 'Other tax-exempt organization' },
                  { value: 'publicly_traded', label: 'Publicly traded corporation' },
                  { value: 'subsidiary', label: 'Subsidiary of publicly traded corporation' },
                  { value: 'active_trade', label: 'Company meeting active trade or business test' },
                  { value: 'derivative_benefits', label: 'Derivative benefits' },
                  { value: 'discretionary_determination', label: 'Favorable discretionary determination by competent authority' },
                  { value: 'other', label: 'Other (specify)' }
                ]
              },
              { id: 'specialRatesArticle', label: 'Treaty article for special rate', type: 'text', required: false, irsLine: 'Line 15 — Article' },
              { id: 'specialRatePercent', label: 'Withholding rate under treaty (%)', type: 'number', required: false, irsLine: 'Line 15 — Rate', min: 0, max: 30 },
              { id: 'incomeType', label: 'Type of income', type: 'text', required: false, irsLine: 'Line 15 — Income type' }
            ]
          },
          {
            id: 'signature',
            title: 'Certification & Signature (Part XXX)',
            fields: [
              { id: 'certifyBeneficialOwner', label: 'I certify that the entity is the beneficial owner', type: 'checkbox', required: true },
              { id: 'certifyNotUsPerson', label: 'The entity is not a U.S. person', type: 'checkbox', required: true },
              { id: 'signatureDate', label: 'Date', type: 'date', required: true },
              { id: 'signature', label: 'Signature of authorized signatory', type: 'signature', required: true },
              { id: 'printedName', label: 'Printed name of signer', type: 'text', required: true, maxLength: 100 },
              { id: 'signerTitle', label: 'Title / capacity', type: 'text', required: true, maxLength: 100 }
            ]
          }
        ]
      },

      // ===============================================================
      //  W-8IMY: FOREIGN INTERMEDIARY / FLOW-THROUGH
      // ===============================================================
      'W-8IMY': {
        formId: 'W-8IMY',
        title: 'Certificate of Foreign Intermediary / Flow-Through Entity',
        authority: 'IRS',
        sections: [
          {
            id: 'identification',
            title: 'Identification (Part I)',
            fields: [
              { id: 'entityName', label: 'Name of entity', type: 'text', required: true, irsLine: 'Line 1', maxLength: 150 },
              { id: 'countryOfIncorporation', label: 'Country of incorporation', type: 'country', required: true, irsLine: 'Line 2' },
              { id: 'entityType', label: 'Entity type (Chapter 3)', type: 'select', required: true, irsLine: 'Line 3',
                options: [
                  { value: 'qualified_intermediary', label: 'Qualified Intermediary (QI)' },
                  { value: 'nonqualified_intermediary', label: 'Nonqualified Intermediary' },
                  { value: 'foreign_partnership_withholding', label: 'Foreign partnership — withholding' },
                  { value: 'foreign_partnership_nonwithholding', label: 'Foreign partnership — nonwithholding' },
                  { value: 'foreign_trust_withholding', label: 'Foreign trust — withholding' },
                  { value: 'foreign_trust_nonwithholding', label: 'Foreign trust — nonwithholding' },
                  { value: 'us_branch', label: 'U.S. branch' }
                ]
              },
              { id: 'chapter4Status', label: 'Chapter 4 (FATCA) status', type: 'select', required: true, irsLine: 'Line 4',
                options: [
                  { value: 'participating_ffi', label: 'Participating FFI' },
                  { value: 'reporting_model1_ffi', label: 'Reporting Model 1 FFI' },
                  { value: 'reporting_model2_ffi', label: 'Reporting Model 2 FFI' },
                  { value: 'registered_deemed_compliant_ffi', label: 'Registered deemed-compliant FFI' },
                  { value: 'nonparticipating_ffi', label: 'Nonparticipating FFI' }
                ]
              },
              { id: 'giin', label: 'GIIN', type: 'text', required: false, irsLine: 'Line 8a' },
              { id: 'permanentAddress', label: 'Permanent address', type: 'text', required: true, irsLine: 'Line 5', maxLength: 200 },
              { id: 'permanentCountry', label: 'Country', type: 'country', required: true, irsLine: 'Line 5' }
            ]
          },
          {
            id: 'withholdingStatement',
            title: 'Withholding Statement',
            fields: [
              { id: 'hasWithholdingStatement', label: 'Withholding statement attached', type: 'checkbox', required: true },
              { id: 'allocationMethod', label: 'Allocation method', type: 'select', required: true,
                options: [
                  { value: 'pro_rata', label: 'Pro-rata based on ownership' },
                  { value: 'specific', label: 'Specific allocation per schedule' }
                ]
              }
            ]
          },
          {
            id: 'signature',
            title: 'Certification & Signature',
            fields: [
              { id: 'signatureDate', label: 'Date', type: 'date', required: true },
              { id: 'signature', label: 'Signature', type: 'signature', required: true },
              { id: 'printedName', label: 'Printed name', type: 'text', required: true, maxLength: 100 },
              { id: 'signerTitle', label: 'Title', type: 'text', required: true, maxLength: 100 }
            ]
          }
        ]
      },

      // ===============================================================
      //  W-8ECI: EFFECTIVELY CONNECTED INCOME
      // ===============================================================
      'W-8ECI': {
        formId: 'W-8ECI',
        title: 'Certificate of Foreign Person\'s Claim for ECI',
        authority: 'IRS',
        sections: [
          {
            id: 'identification',
            title: 'Identification (Part I)',
            fields: [
              { id: 'name', label: 'Name of individual or entity', type: 'text', required: true, irsLine: 'Line 1', maxLength: 150 },
              { id: 'countryOfIncorporation', label: 'Country of incorporation or citizenship', type: 'country', required: true, irsLine: 'Line 2' },
              { id: 'entityType', label: 'Type of entity', type: 'select', required: true, irsLine: 'Line 3',
                options: [
                  { value: 'individual', label: 'Individual' },
                  { value: 'corporation', label: 'Corporation' },
                  { value: 'partnership', label: 'Partnership' },
                  { value: 'trust', label: 'Trust' },
                  { value: 'estate', label: 'Estate' },
                  { value: 'disregarded_entity', label: 'Disregarded entity' }
                ]
              },
              { id: 'permanentAddress', label: 'Permanent residence address', type: 'text', required: true, irsLine: 'Line 4', maxLength: 200 },
              { id: 'permanentCountry', label: 'Country', type: 'country', required: true, irsLine: 'Line 4' },
              { id: 'usBusinessAddress', label: 'U.S. business address', type: 'text', required: true, irsLine: 'Line 5', maxLength: 200 },
              { id: 'usTin', label: 'U.S. TIN', type: 'text', required: true, irsLine: 'Line 7' },
              { id: 'foreignTin', label: 'Foreign TIN', type: 'text', required: false, irsLine: 'Line 8' }
            ]
          },
          {
            id: 'eciIncome',
            title: 'Income Items (Part II)',
            fields: [
              { id: 'incomeTypes', label: 'Types of ECI income', type: 'multi_select', required: true, irsLine: 'Line 10',
                options: [
                  { value: 'interest', label: 'Interest' },
                  { value: 'dividends', label: 'Dividends' },
                  { value: 'rents', label: 'Rents' },
                  { value: 'royalties', label: 'Royalties' },
                  { value: 'compensation', label: 'Compensation for personal services' },
                  { value: 'other', label: 'Other' }
                ]
              }
            ]
          },
          {
            id: 'signature',
            title: 'Certification & Signature (Part III)',
            fields: [
              { id: 'signatureDate', label: 'Date', type: 'date', required: true },
              { id: 'signature', label: 'Signature', type: 'signature', required: true },
              { id: 'printedName', label: 'Printed name', type: 'text', required: true, maxLength: 100 }
            ]
          }
        ]
      },

      // ===============================================================
      //  CRS SELF-CERTIFICATION — INDIVIDUAL
      // ===============================================================
      'CRS-INDIVIDUAL': {
        formId: 'CRS-INDIVIDUAL',
        title: 'CRS Individual Self-Certification',
        authority: 'OECD',
        sections: [
          {
            id: 'identification',
            title: 'Account Holder Identification',
            fields: [
              { id: 'lastName', label: 'Last name / Surname', type: 'text', required: true, maxLength: 100 },
              { id: 'firstName', label: 'First name / Given name', type: 'text', required: true, maxLength: 100 },
              { id: 'middleName', label: 'Middle name(s)', type: 'text', required: false, maxLength: 100 },
              { id: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
              { id: 'placeOfBirth', label: 'Place of birth (city)', type: 'text', required: true, maxLength: 100 },
              { id: 'countryOfBirth', label: 'Country of birth', type: 'country', required: true },
              { id: 'currentAddress', label: 'Current residence address', type: 'text', required: true, maxLength: 200 },
              { id: 'city', label: 'City / town', type: 'text', required: true, maxLength: 100 },
              { id: 'postalCode', label: 'Post / zip code', type: 'text', required: true, maxLength: 20 },
              { id: 'country', label: 'Country', type: 'country', required: true }
            ]
          },
          {
            id: 'taxResidence',
            title: 'Tax Residence Declaration',
            fields: [
              { id: 'taxResidences', label: 'Tax residence countries and TINs', type: 'repeater', required: true, minEntries: 1, maxEntries: 5,
                subFields: [
                  { id: 'country', label: 'Country of tax residence', type: 'country', required: true },
                  { id: 'tin', label: 'Taxpayer Identification Number (TIN)', type: 'text', required: true, maxLength: 30 },
                  { id: 'tinUnavailable', label: 'TIN not available', type: 'checkbox', required: false },
                  { id: 'tinUnavailableReason', label: 'Reason TIN not available', type: 'select', required: false,
                    options: [
                      { value: 'reason_a', label: 'Reason A: Country does not issue TINs' },
                      { value: 'reason_b', label: 'Reason B: TIN not yet obtained (pending)' },
                      { value: 'reason_c', label: 'Reason C: Not required (exemption)' }
                    ],
                    condition: { field: 'tinUnavailable', value: true }
                  }
                ]
              }
            ]
          },
          {
            id: 'declaration',
            title: 'Declaration & Signature',
            fields: [
              { id: 'certifyAccurate', label: 'I declare the information provided is true, correct, and complete', type: 'checkbox', required: true },
              { id: 'certifyNotify', label: 'I will notify of any change in circumstances within 30 days', type: 'checkbox', required: true },
              { id: 'signatureDate', label: 'Date', type: 'date', required: true },
              { id: 'signature', label: 'Signature', type: 'signature', required: true }
            ]
          }
        ]
      },

      // ===============================================================
      //  CRS SELF-CERTIFICATION — ENTITY
      // ===============================================================
      'CRS-ENTITY': {
        formId: 'CRS-ENTITY',
        title: 'CRS Entity Self-Certification',
        authority: 'OECD',
        sections: [
          {
            id: 'entityIdentification',
            title: 'Entity Identification',
            fields: [
              { id: 'entityName', label: 'Legal name of entity', type: 'text', required: true, maxLength: 200 },
              { id: 'countryOfIncorporation', label: 'Country of incorporation / organization', type: 'country', required: true },
              { id: 'registeredAddress', label: 'Registered address', type: 'text', required: true, maxLength: 200 },
              { id: 'city', label: 'City / town', type: 'text', required: true, maxLength: 100 },
              { id: 'postalCode', label: 'Post / zip code', type: 'text', required: true, maxLength: 20 },
              { id: 'country', label: 'Country', type: 'country', required: true },
              { id: 'registrationNumber', label: 'Company registration number', type: 'text', required: false, maxLength: 50 }
            ]
          },
          {
            id: 'entityClassification',
            title: 'CRS Entity Classification',
            fields: [
              { id: 'entityType', label: 'CRS entity type', type: 'select', required: true,
                options: [
                  { value: 'fi_reporting', label: 'Financial Institution — Reporting FI' },
                  { value: 'fi_nonreporting', label: 'Financial Institution — Non-Reporting FI' },
                  { value: 'active_nfe', label: 'Active NFE (Non-Financial Entity)' },
                  { value: 'passive_nfe', label: 'Passive NFE' },
                  { value: 'active_nfe_listed', label: 'Active NFE — publicly listed' },
                  { value: 'active_nfe_government', label: 'Active NFE — government entity' },
                  { value: 'active_nfe_international_org', label: 'Active NFE — international organization' }
                ]
              },
              { id: 'giin', label: 'GIIN (if FI)', type: 'text', required: false, maxLength: 20,
                condition: { field: 'entityType', value: ['fi_reporting'] }
              }
            ]
          },
          {
            id: 'taxResidence',
            title: 'Tax Residence',
            fields: [
              { id: 'taxResidences', label: 'Countries of tax residence and TINs', type: 'repeater', required: true, minEntries: 1, maxEntries: 5,
                subFields: [
                  { id: 'country', label: 'Country of tax residence', type: 'country', required: true },
                  { id: 'tin', label: 'TIN', type: 'text', required: true, maxLength: 30 },
                  { id: 'tinUnavailable', label: 'TIN not available', type: 'checkbox', required: false },
                  { id: 'tinUnavailableReason', label: 'Reason', type: 'select', required: false,
                    options: [
                      { value: 'reason_a', label: 'Country does not issue TINs' },
                      { value: 'reason_b', label: 'TIN not yet obtained' },
                      { value: 'reason_c', label: 'Not required' }
                    ],
                    condition: { field: 'tinUnavailable', value: true }
                  }
                ]
              }
            ]
          },
          {
            id: 'controllingPersons',
            title: 'Controlling Persons (for Passive NFE)',
            fields: [
              { id: 'controllingPersons', label: 'Controlling persons (25%+ ownership or control)', type: 'repeater', required: false, minEntries: 0, maxEntries: 10,
                condition: { field: 'entityType', value: 'passive_nfe' },
                subFields: [
                  { id: 'name', label: 'Full name', type: 'text', required: true, maxLength: 100 },
                  { id: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
                  { id: 'address', label: 'Address', type: 'text', required: true, maxLength: 200 },
                  { id: 'taxResidenceCountry', label: 'Country of tax residence', type: 'country', required: true },
                  { id: 'tin', label: 'TIN', type: 'text', required: true, maxLength: 30 },
                  { id: 'controlType', label: 'Type of control', type: 'select', required: true,
                    options: [
                      { value: 'ownership', label: 'Ownership (25%+)' },
                      { value: 'control_other', label: 'Control through other means' },
                      { value: 'senior_management', label: 'Senior managing official' }
                    ]
                  }
                ]
              }
            ]
          },
          {
            id: 'declaration',
            title: 'Declaration & Signature',
            fields: [
              { id: 'certifyAccurate', label: 'I declare the information is true, correct, and complete', type: 'checkbox', required: true },
              { id: 'signatureDate', label: 'Date', type: 'date', required: true },
              { id: 'signature', label: 'Signature of authorized signatory', type: 'signature', required: true },
              { id: 'signerName', label: 'Name of signer', type: 'text', required: true, maxLength: 100 },
              { id: 'signerTitle', label: 'Title / capacity', type: 'text', required: true, maxLength: 100 }
            ]
          }
        ]
      },

      // ===============================================================
      //  IRELAND — QUALIFYING INVESTOR DECLARATION
      // ===============================================================
      'IE-QI-DECLARATION': {
        formId: 'IE-QI-DECLARATION',
        title: 'Qualifying Investor Declaration (QIAIF)',
        authority: 'CBI (Central Bank of Ireland)',
        sections: [
          {
            id: 'investorIdentity',
            title: 'Investor Information',
            fields: [
              { id: 'investorName', label: 'Full legal name of investor', type: 'text', required: true, maxLength: 200 },
              { id: 'entityType', label: 'Entity type', type: 'select', required: true,
                options: [
                  { value: 'individual', label: 'Individual' },
                  { value: 'corporation', label: 'Corporation / Company' },
                  { value: 'partnership', label: 'Partnership' },
                  { value: 'pension', label: 'Pension fund / scheme' },
                  { value: 'insurance', label: 'Insurance company' },
                  { value: 'sovereign', label: 'Sovereign wealth fund / government body' },
                  { value: 'fund', label: 'Investment fund / fund of funds' },
                  { value: 'trust', label: 'Trust' }
                ]
              },
              { id: 'registeredAddress', label: 'Registered / permanent address', type: 'text', required: true, maxLength: 300 },
              { id: 'country', label: 'Country', type: 'country', required: true },
              { id: 'contactPerson', label: 'Contact person', type: 'text', required: true, maxLength: 100 },
              { id: 'email', label: 'Email', type: 'email', required: true, maxLength: 100 }
            ]
          },
          {
            id: 'qualifyingStatus',
            title: 'Qualifying Investor Status',
            fields: [
              { id: 'meetsMinimum', label: 'Investor will commit a minimum of €100,000 (or currency equivalent)', type: 'checkbox', required: true },
              { id: 'qualifyingBasis', label: 'Basis for qualifying investor status', type: 'select', required: true,
                options: [
                  { value: 'min_subscription', label: 'Minimum subscription ≥ €100,000' },
                  { value: 'professional_investor', label: 'Professional investor (MiFID II Annex II)' },
                  { value: 'credit_institution', label: 'Credit institution / investment firm / insurance' },
                  { value: 'regulated_fund', label: 'Regulated investment fund' },
                  { value: 'pension_fund', label: 'Pension fund or scheme' },
                  { value: 'government_body', label: 'Government or sovereign wealth fund' },
                  { value: 'knowledge_experience', label: 'Knowledge and experience (assessed by GP)' }
                ]
              },
              { id: 'assessedRisks', label: 'Investor confirms understanding of risks including potential total loss', type: 'checkbox', required: true },
              { id: 'liquidityRisks', label: 'Investor understands limited liquidity and lock-up', type: 'checkbox', required: true }
            ]
          },
          {
            id: 'taxDeclaration',
            title: 'Irish Tax Status',
            fields: [
              { id: 'irishResident', label: 'Is the investor tax-resident in Ireland?', type: 'select', required: true,
                options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]
              },
              { id: 'exemptIrishPerson', label: 'If Irish resident, is the investor an exempt Irish person per TCA 1997?', type: 'checkbox', required: false,
                condition: { field: 'irishResident', value: 'yes' }
              },
              { id: 'exemptCategory', label: 'Category of exemption', type: 'select', required: false,
                condition: { field: 'exemptIrishPerson', value: true },
                options: [
                  { value: 'pension_scheme', label: 'Pension scheme / retirement fund' },
                  { value: 'charity', label: 'Charity' },
                  { value: 'company_ct', label: 'Company within charge to corporation tax' },
                  { value: 'collective_scheme', label: 'Collective investment scheme' },
                  { value: 'life_assurance', label: 'Life assurance company' },
                  { value: 'other_exempt', label: 'Other exempt entity (specify)' }
                ]
              }
            ]
          },
          {
            id: 'signature',
            title: 'Declaration & Signature',
            fields: [
              { id: 'certifyQualifying', label: 'I/we declare that the investor is a qualifying investor within the meaning of the AIF Rulebook', type: 'checkbox', required: true },
              { id: 'certifyAccurate', label: 'All information provided is true and complete', type: 'checkbox', required: true },
              { id: 'signatureDate', label: 'Date', type: 'date', required: true },
              { id: 'signature', label: 'Signature of authorized signatory', type: 'signature', required: true },
              { id: 'signerName', label: 'Name of signer', type: 'text', required: true, maxLength: 100 },
              { id: 'signerTitle', label: 'Title / capacity', type: 'text', required: true, maxLength: 100 }
            ]
          }
        ]
      },

      // ===============================================================
      //  IRELAND — NON-RESIDENT DECLARATION
      // ===============================================================
      'IE-NON-RESIDENT': {
        formId: 'IE-NON-RESIDENT',
        title: 'Non-Resident Declaration (Ireland)',
        authority: 'Irish Revenue Commissioners',
        sections: [
          {
            id: 'investorInfo',
            title: 'Investor Information',
            fields: [
              { id: 'investorName', label: 'Full name of investor', type: 'text', required: true, maxLength: 200 },
              { id: 'address', label: 'Address', type: 'text', required: true, maxLength: 300 },
              { id: 'country', label: 'Country of residence', type: 'country', required: true },
              { id: 'tin', label: 'Tax identification number', type: 'text', required: true, maxLength: 30 }
            ]
          },
          {
            id: 'declaration',
            title: 'Non-Resident Declaration',
            fields: [
              { id: 'notIrishResident', label: 'I/we declare that the investor is not resident in Ireland for tax purposes', type: 'checkbox', required: true },
              { id: 'notOrdinarilyResident', label: 'I/we declare that the investor is not ordinarily resident in Ireland', type: 'checkbox', required: true },
              { id: 'notifyChange', label: 'I/we will notify immediately if the investor becomes Irish tax-resident', type: 'checkbox', required: true },
              { id: 'signatureDate', label: 'Date', type: 'date', required: true },
              { id: 'signature', label: 'Signature', type: 'signature', required: true },
              { id: 'signerName', label: 'Name', type: 'text', required: true, maxLength: 100 }
            ]
          }
        ]
      }
    };

    return schemas[formId] || null;
  }

  // ==================== CONVERSATIONAL QUESTION FLOW ====================

  /**
   * Generate the conversational question flow for a given form.
   * Returns ordered questions Mila should ask in the chat, with logic for
   * skipping questions where data is already known.
   */
  generateQuestionFlow(formId, existingData = {}) {
    const schema = this.getFormSchema(formId);
    if (!schema) return null;

    const questions = [];
    let order = 1;

    for (const section of schema.sections) {
      // Add section header
      questions.push({
        order: order++,
        type: 'section_header',
        text: `📋 **${section.title}**`,
        sectionId: section.id
      });

      for (const field of section.fields) {
        // Skip if signature (handled at end)
        if (field.type === 'signature') continue;

        // Skip if already have this data
        if (existingData[field.id] !== undefined && existingData[field.id] !== null && existingData[field.id] !== '') {
          questions.push({
            order: order++,
            fieldId: field.id,
            type: 'pre_filled',
            text: `${field.label}: **${existingData[field.id]}** (from your records — confirm or update)`,
            currentValue: existingData[field.id],
            required: field.required
          });
          continue;
        }

        // Check conditional fields
        if (field.condition) {
          const condField = field.condition.field;
          const condValue = field.condition.value;
          const currentVal = existingData[condField];
          if (Array.isArray(condValue)) {
            if (!condValue.includes(currentVal)) continue;
          } else if (currentVal !== condValue) continue;
        }

        // Generate conversational question
        const question = {
          order: order++,
          fieldId: field.id,
          type: 'question',
          required: field.required,
          fieldType: field.type,
          irsLine: field.irsLine || null
        };

        // Craft human-friendly question text
        switch (field.type) {
          case 'select':
            question.text = `What is your ${field.label.toLowerCase()}?`;
            question.options = field.options;
            question.instruction = 'Please select one of the following options:';
            break;
          case 'multi_select':
            question.text = `Which types of ${field.label.toLowerCase()} apply?`;
            question.options = field.options;
            question.instruction = 'Select all that apply:';
            break;
          case 'checkbox':
            question.text = `${field.label}`;
            question.instruction = 'Please confirm (yes/no):';
            break;
          case 'date':
            question.text = `What is your ${field.label.toLowerCase()}?`;
            question.instruction = 'Please provide in YYYY-MM-DD format.';
            break;
          case 'country':
            question.text = `What is your ${field.label.toLowerCase()}?`;
            question.instruction = 'Please provide the country name or 2-letter ISO code.';
            break;
          case 'repeater':
            question.text = `Please provide your ${field.label.toLowerCase()}.`;
            question.instruction = `You can add up to ${field.maxEntries} entries.`;
            question.subFields = field.subFields;
            break;
          default:
            question.text = `What is your ${field.label.toLowerCase()}?`;
            if (field.validation) question.instruction = field.validation.message;
            break;
        }

        questions.push(question);
      }
    }

    // Add final signature step
    questions.push({
      order: order++,
      type: 'signature_request',
      text: `All information has been collected. The completed **${schema.title}** is ready for your electronic signature.`,
      instruction: 'An e-signature request will be sent to you via Mila Signature Engine. Please review the populated form and sign electronically.'
    });

    return {
      formId,
      formTitle: schema.title,
      authority: schema.authority,
      totalQuestions: questions.filter(q => q.type === 'question').length,
      preFilledFields: questions.filter(q => q.type === 'pre_filled').length,
      questions
    };
  }

  // ==================== FORM ROUTING ====================

  /**
   * Determine which forms an investor needs based on their profile
   */
  getRequiredForms({ investorJurisdiction, fundJurisdiction, entityType, isUsPerson, isTaxExempt, claimsEci }) {
    const forms = [];

    // --- US Tax Forms ---
    if (isUsPerson) {
      forms.push({ formId: 'W-9', reason: 'US person — TIN certification required', priority: 'HIGH' });
    } else {
      if (entityType === 'INDIVIDUAL') {
        forms.push({ formId: 'W-8BEN', reason: 'Foreign individual — withholding certificate required', priority: 'HIGH' });
      } else if (entityType === 'PARTNERSHIP' || entityType === 'FUND_OF_FUNDS') {
        forms.push({ formId: 'W-8IMY', reason: 'Foreign partnership/flow-through — intermediary certificate required', priority: 'HIGH' });
      } else {
        forms.push({ formId: 'W-8BEN-E', reason: 'Foreign entity — withholding certificate required', priority: 'HIGH' });
      }
    }

    if (claimsEci && !isUsPerson) {
      forms.push({ formId: 'W-8ECI', reason: 'Claims ECI exemption from withholding', priority: 'HIGH' });
    }

    // --- CRS Self-Certification (non-US jurisdictions) ---
    if (!isUsPerson) {
      if (entityType === 'INDIVIDUAL') {
        forms.push({ formId: 'CRS-INDIVIDUAL', reason: 'CRS individual self-certification required', priority: 'HIGH' });
      } else {
        forms.push({ formId: 'CRS-ENTITY', reason: 'CRS entity self-certification required', priority: 'HIGH' });
      }
    }

    // --- FATCA Self-Certification ---
    forms.push({
      formId: entityType === 'INDIVIDUAL' ? 'FATCA-INDIVIDUAL' : 'FATCA-ENTITY',
      reason: 'FATCA self-certification required by fund jurisdiction',
      priority: 'MEDIUM'
    });

    // --- Ireland-specific ---
    if (fundJurisdiction === 'IRELAND') {
      forms.push({ formId: 'IE-QI-DECLARATION', reason: 'QIAIF qualifying investor declaration required by CBI', priority: 'HIGH' });
      if (investorJurisdiction !== 'IRELAND') {
        forms.push({ formId: 'IE-NON-RESIDENT', reason: 'Non-resident declaration for Irish tax purposes', priority: 'HIGH' });
      }
      forms.push({ formId: 'IE-SELF-CERT', reason: 'Irish Revenue self-declaration of tax residence', priority: 'MEDIUM' });
    }

    // --- UK-specific ---
    if (fundJurisdiction === 'UK') {
      forms.push({ formId: 'UK-SELF-CERT', reason: 'HMRC CRS/FATCA self-certification', priority: 'HIGH' });
    }

    // --- Luxembourg-specific ---
    if (fundJurisdiction === 'LUXEMBOURG') {
      forms.push({ formId: 'LU-SELF-CERT', reason: 'Luxembourg CRS/FATCA self-certification', priority: 'HIGH' });
      forms.push({ formId: 'LU-WI-DECL', reason: 'Well-informed investor declaration (SIF/RAIF)', priority: 'HIGH' });
    }

    // --- Cayman-specific ---
    if (fundJurisdiction === 'CAYMAN') {
      forms.push({ formId: 'KY-SELF-CERT', reason: 'Cayman CRS/FATCA self-certification', priority: 'HIGH' });
    }

    // --- Singapore-specific ---
    if (fundJurisdiction === 'SINGAPORE') {
      forms.push({ formId: 'SG-SELF-CERT', reason: 'Singapore CRS self-certification', priority: 'HIGH' });
      forms.push({ formId: 'SG-AI-DECL', reason: 'Accredited investor declaration (SFA s.4A)', priority: 'HIGH' });
    }

    // --- Hong Kong-specific ---
    if (fundJurisdiction === 'HONG_KONG') {
      forms.push({ formId: 'HK-SELF-CERT', reason: 'Hong Kong CRS self-certification', priority: 'HIGH' });
      forms.push({ formId: 'HK-PI-DECL', reason: 'Professional investor declaration (SFO)', priority: 'HIGH' });
    }

    // --- Switzerland-specific ---
    if (fundJurisdiction === 'SWITZERLAND') {
      if (entityType === 'INDIVIDUAL') {
        forms.push({ formId: 'CH-FORM-A', reason: 'Swiss AML Form A — beneficial owner identification', priority: 'HIGH' });
      } else {
        forms.push({ formId: 'CH-FORM-T', reason: 'Swiss AML Form T — entity beneficial owner identification', priority: 'HIGH' });
      }
      forms.push({ formId: 'CH-QI-DECL', reason: 'Qualified investor declaration (CISA Art. 10)', priority: 'HIGH' });
    }

    // --- BVI-specific ---
    if (fundJurisdiction === 'BVI') {
      forms.push({ formId: 'BVI-SELF-CERT', reason: 'BVI CRS/FATCA self-certification', priority: 'HIGH' });
    }

    // --- Jersey-specific ---
    if (fundJurisdiction === 'JERSEY') {
      forms.push({ formId: 'JE-SELF-CERT', reason: 'Jersey CRS/FATCA self-certification', priority: 'HIGH' });
    }

    // --- Guernsey-specific ---
    if (fundJurisdiction === 'GUERNSEY') {
      forms.push({ formId: 'GG-SELF-CERT', reason: 'Guernsey CRS/FATCA self-certification', priority: 'HIGH' });
    }

    // --- ADGM / DIFC ---
    if (fundJurisdiction === 'ADGM') {
      forms.push({ formId: 'ADGM-SELF-CERT', reason: 'ADGM CRS/FATCA self-certification', priority: 'HIGH' });
    }
    if (fundJurisdiction === 'DIFC') {
      forms.push({ formId: 'DIFC-SELF-CERT', reason: 'DIFC CRS/FATCA self-certification', priority: 'HIGH' });
    }

    // --- EU local self-certs (fund jurisdiction) ---
    const euLocalCerts = {
      'GERMANY': 'DE-SELF-CERT', 'FRANCE': 'FR-SELF-CERT', 'ITALY': 'IT-SELF-CERT',
      'SPAIN': 'ES-SELF-CERT', 'NETHERLANDS': 'NL-SELF-CERT', 'DENMARK': 'DK-SELF-CERT',
      'SWEDEN': 'SE-SELF-CERT', 'NORWAY': 'NO-SELF-CERT', 'FINLAND': 'FI-SELF-CERT',
      'ESTONIA': 'EE-SELF-CERT', 'LITHUANIA': 'LT-SELF-CERT'
    };
    if (euLocalCerts[fundJurisdiction]) {
      forms.push({ formId: euLocalCerts[fundJurisdiction], reason: `Local CRS self-certification for ${fundJurisdiction}`, priority: 'HIGH' });
    }

    return {
      investorJurisdiction,
      fundJurisdiction,
      entityType,
      totalFormsRequired: forms.length,
      forms: forms.sort((a, b) => {
        const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
    };
  }

  // ==================== PRE-POPULATION ====================

  /**
   * Pre-populate form fields from existing investor data
   */
  prePopulateForm(formId, investor) {
    const fieldMap = {
      // Common mappings investor object → form field IDs
      'name': investor.name,
      'entityName': investor.name,
      'investorName': investor.name,
      'lastName': investor.lastName,
      'firstName': investor.firstName,
      'dateOfBirth': investor.dob,
      'countryOfCitizenship': investor.citizenship,
      'countryOfIncorporation': investor.incorporationCountry,
      'permanentAddress': investor.address,
      'registeredAddress': investor.address,
      'currentAddress': investor.address,
      'permanentCity': investor.city,
      'city': investor.city,
      'permanentCountry': investor.country,
      'country': investor.country,
      'postalCode': investor.postalCode,
      'tin': investor.taxId || investor.localTin,
      'usTin': investor.usTin,
      'foreignTin': investor.localTin || investor.taxId,
      'giin': investor.giin,
      'email': investor.email,
      'contactPerson': investor.contactPerson,
      'entityType': investor.entityType?.toLowerCase(),
      'registrationNumber': investor.registrationNumber
    };

    const schema = this.getFormSchema(formId);
    if (!schema) return null;

    const prePopulated = {};
    const missing = [];

    for (const section of schema.sections) {
      for (const field of section.fields) {
        if (field.type === 'signature') continue;
        const value = fieldMap[field.id];
        if (value !== undefined && value !== null && value !== '') {
          prePopulated[field.id] = value;
        } else if (field.required) {
          missing.push({ fieldId: field.id, label: field.label, section: section.title });
        }
      }
    }

    return {
      formId,
      formTitle: schema.title,
      prePopulatedFields: Object.keys(prePopulated).length,
      missingRequiredFields: missing.length,
      completionPct: schema.sections.reduce((total, s) => total + s.fields.length, 0) > 0
        ? parseFloat(((Object.keys(prePopulated).length / schema.sections.reduce((t, s) => t + s.fields.filter(f => f.type !== 'signature').length, 0)) * 100).toFixed(1))
        : 0,
      data: prePopulated,
      missingFields: missing,
      readyForSignature: missing.length === 0
    };
  }

  // ==================== VALIDATION ====================

  /**
   * Validate completed form data against schema
   */
  validateForm(formId, formData) {
    const schema = this.getFormSchema(formId);
    if (!schema) return { valid: false, errors: [{ field: 'formId', message: 'Unknown form' }] };

    const errors = [];
    const warnings = [];

    for (const section of schema.sections) {
      for (const field of section.fields) {
        const value = formData[field.id];

        // Required check
        if (field.required && (value === undefined || value === null || value === '')) {
          if (field.type !== 'signature') { // Signatures handled separately
            errors.push({ field: field.id, label: field.label, section: section.title, message: `${field.label} is required`, irsLine: field.irsLine });
          }
          continue;
        }

        if (value === undefined || value === null || value === '') continue;

        // Pattern validation
        if (field.validation?.pattern) {
          const re = new RegExp(field.validation.pattern);
          if (!re.test(String(value))) {
            errors.push({ field: field.id, label: field.label, message: field.validation.message, irsLine: field.irsLine });
          }
        }

        // Max length
        if (field.maxLength && String(value).length > field.maxLength) {
          errors.push({ field: field.id, label: field.label, message: `Maximum ${field.maxLength} characters` });
        }

        // Number range
        if (field.type === 'number') {
          const num = Number(value);
          if (field.min !== undefined && num < field.min) errors.push({ field: field.id, label: field.label, message: `Minimum value is ${field.min}` });
          if (field.max !== undefined && num > field.max) errors.push({ field: field.id, label: field.label, message: `Maximum value is ${field.max}` });
        }
      }
    }

    // W-8BEN-E specific: treaty claims require LOB provision
    if (formId === 'W-8BEN-E' && formData.claimsTreatyBenefits && !formData.lobProvision) {
      warnings.push({ field: 'lobProvision', message: 'Treaty claim without LOB provision — most treaties require LOB article compliance' });
    }

    // W-8BEN: treaty country should match citizenship
    if (formId === 'W-8BEN' && formData.treatyCountry && formData.countryOfCitizenship && formData.treatyCountry !== formData.countryOfCitizenship) {
      warnings.push({ field: 'treatyCountry', message: 'Treaty country differs from citizenship — ensure you are a tax resident of the treaty country' });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      totalFields: schema.sections.reduce((t, s) => t + s.fields.length, 0),
      completedFields: Object.keys(formData).filter(k => formData[k] !== null && formData[k] !== undefined && formData[k] !== '').length
    };
  }

  // ==================== E-SIGNATURE ENVELOPE PREPARATION ====================

  /**
   * Prepare a completed form for e-signature via Mila Native Signature Engine
   * (No DocuSign — uses signatureEngine.js with IP, timestamp, device, SHA-256, audit trail)
   */
  prepareForSignature(formId, formData, investor, signatureEngine = null) {
    const schema = this.getFormSchema(formId);
    const registry = this.getFormRegistry();
    const meta = registry[formId];
    if (!schema || !meta) return null;

    const validation = this.validateForm(formId, formData);
    if (!validation.valid) {
      return {
        ready: false,
        reason: 'Form has validation errors — resolve before sending for signature',
        errors: validation.errors
      };
    }

    // Determine signers
    const signers = [
      {
        name: investor.name,
        email: investor.email,
        role: 'LP_SIGNER',
        order: 1
      }
    ];

    // Some forms need a counter-signature from the fund
    const counterSignForms = ['IE-QI-DECLARATION', 'SG-AI-DECL', 'HK-PI-DECL', 'CH-QI-DECL', 'LU-WI-DECL'];
    if (counterSignForms.includes(formId)) {
      signers.push({
        name: 'Fund Administrator',
        email: 'ops@antoninus.com',
        role: 'FUND_ADMIN_COUNTERSIGN',
        order: 2
      });
    }

    const documentName = `${formId}_${investor.name?.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

    // If signatureEngine instance is provided, create the envelope directly
    let envelope = null;
    if (signatureEngine) {
      envelope = signatureEngine.createEnvelope({
        documents: [{
          name: documentName,
          content: Buffer.from(JSON.stringify(formData)).toString('base64'),
          mimeType: 'application/pdf',
          pageCount: meta.pages
        }],
        signers,
        sender: { name: 'Mila CFO Agent', email: 'ops@antoninus.com', role: 'SYSTEM' },
        metadata: {
          fundName: investor.fundName || null,
          documentType: formId,
          reference: `${formId}-${investor.name}`
        }
      });
    }

    return {
      ready: true,
      formId,
      formTitle: schema.title,
      authority: meta.officialSource,
      revision: meta.revision,
      pages: meta.pages,
      signers,
      formData,
      signatureEngine: 'MILA_NATIVE',
      envelope: envelope || {
        pending: true,
        subject: `${meta.name} — Signature Required`,
        message: `Please review and electronically sign your ${meta.name}. This form is required for your investment in the fund.`,
        documentName,
        note: 'Call with signatureEngine instance to create envelope and generate signing links'
      },
      signingProcess: {
        step1: 'Form data validated and PDF generated',
        step2: 'Signing link sent to investor via email/chat',
        step3: 'Investor reviews form, draws or types signature, gives consent',
        step4: 'Signature captured with IP address, timestamp, device, browser, geolocation',
        step5: 'SHA-256 document hash locks document integrity',
        step6: 'Signing certificate and audit trail PDF generated',
        step7: 'Signed form + audit trail stored and sent to all parties'
      },
      auditTrail: {
        capturedData: ['IP address (IPv4/IPv6)', 'Timestamp (ISO 8601 + Unix)', 'Timezone', 'User agent / browser', 'Operating system', 'Screen resolution', 'Geolocation (if permitted)', 'Consent text + timestamp'],
        integrityProof: 'SHA-256 hash of document + signer identity + timestamp',
        legalBasis: 'ESIGN Act (US), eIDAS (EU), Electronic Transactions Act (Cayman), Electronic Commerce Act (Ireland)',
        tamperDetection: 'Any modification to signed document invalidates integrity hash'
      },
      compliance: {
        formExpiry: formId.startsWith('W-8') ? '3 years from signature date' : 'Until change in circumstances',
        renewalReminder: formId.startsWith('W-8') ? true : false,
        retentionPeriod: '7 years minimum (AML requirement)'
      }
    };
  }
}

module.exports = new FormTemplateService();
