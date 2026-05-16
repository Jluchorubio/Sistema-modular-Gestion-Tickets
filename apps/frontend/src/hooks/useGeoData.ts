'use client';

import { useState, useEffect } from 'react';
import { geoService } from '@/services/geo.service';

export function useGeoData(country: string, state: string) {
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [stateOptions,   setStateOptions]   = useState<string[]>([]);
  const [cityOptions,    setCityOptions]     = useState<string[]>([]);
  const [statesLoading,  setStatesLoading]  = useState(false);
  const [citiesLoading,  setCitiesLoading]  = useState(false);

  // Load countries once
  useEffect(() => {
    geoService.getCountries().then(setCountryOptions).catch(() => {});
  }, []);

  // Load states when country changes
  useEffect(() => {
    if (!country) {
      setStateOptions([]);
      setCityOptions([]);
      return;
    }
    setStatesLoading(true);
    setStateOptions([]);
    setCityOptions([]);
    geoService.getStates(country)
      .then(setStateOptions)
      .catch(() => {})
      .finally(() => setStatesLoading(false));
  }, [country]);

  // Load cities when state changes
  useEffect(() => {
    if (!country || !state) {
      setCityOptions([]);
      return;
    }
    setCitiesLoading(true);
    setCityOptions([]);
    geoService.getCities(country, state)
      .then(setCityOptions)
      .catch(() => {})
      .finally(() => setCitiesLoading(false));
  }, [country, state]);

  return { countryOptions, stateOptions, cityOptions, statesLoading, citiesLoading };
}
