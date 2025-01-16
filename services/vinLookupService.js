const axios = require('axios');

module.exports = {
  lookupVIN: async (vin) => {
    try {
      // Example: Real or mock VIN API call
      // e.g. https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesExtended/${vin}?format=json
      // For demonstration, assume we have a fake endpoint and API key:
      const response = await axios.get(
        `np`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.VIN_API_KEY}`
          }
        }
      );
      
      // Suppose it returns { make, model }
      const { make, model } = response.data;
      return { make, model };
    } catch (err) {
      console.error('VIN lookup failed:', err);
      return { make: '', model: '' };
    }
  }
};
