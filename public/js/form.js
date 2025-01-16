// Google Maps Autocomplete
function initAutocomplete() {
  const pickupInput = document.getElementById('pickupLocation');
  const deliveryInput = document.getElementById('deliveryLocation');
  if (pickupInput) {
    new google.maps.places.Autocomplete(pickupInput);
  }
  if (deliveryInput) {
    new google.maps.places.Autocomplete(deliveryInput);
  }
}

// VIN Lookup
document.addEventListener('DOMContentLoaded', () => {
  const lookupVinBtn = document.getElementById('lookupVinBtn');
  const vinInput = document.getElementById('vin');
  const makeInput = document.getElementById('make');
  const modelInput = document.getElementById('model');

  if (lookupVinBtn) {
    lookupVinBtn.addEventListener('click', async () => {
      if (!vinInput.value.trim()) return;
      try {
        const res = await fetch(`/forms/vin-lookup/${vinInput.value.trim()}`);
        const data = await res.json();
        makeInput.value = data.make || '';
        modelInput.value = data.model || '';
      } catch (err) {
        console.error('VIN lookup failed:', err);
      }
    });
  }
});

// Expose initAutocomplete so the Google script can call it
window.initAutocomplete = initAutocomplete;