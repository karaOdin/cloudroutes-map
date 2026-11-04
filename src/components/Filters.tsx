import Select, { SingleValue } from "react-select";
import { createSelectStyles } from "../styles/select-theme.ts";
import { useFilters } from "../hooks/use-filters.ts";
import { useMapLinesOption } from "../hooks/use-map-lines-name.ts";
import { useGlobalStore } from "../store";
import { LEAFLET_PROVIDERS } from "../constants";
import { useTranslation } from "react-i18next";

type SelectOption = { label: string; value: string };

type Props = {
  onApply?: VoidFunction;
};

export function Filters({ onApply }: Props) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const { selectedFilters, handleChange, handleApply } = useFilters();
  const lines = useMapLinesOption();
  const currentLeafletProvider = useGlobalStore(
    (state) => state.leafletProvider,
  );
  const setLeafletProvider = useGlobalStore(
    (state) => state.setLeafletProvider,
  );

  const applyFilters = () => {
    onApply?.();
    handleApply();
  };

  const singleSelectStyles = createSelectStyles<SelectOption, false>(isRTL);
  const multiSelectStyles = createSelectStyles<SelectOption, true>(isRTL);

  const stopFilters = [
    { value: "all", label: t("filters.all") },
    { value: "none", label: t("filters.none") },
    { value: "line-only", label: t("filters.line_only") },
  ];

  const busFilters = [
    { value: "all", label: t("filters.all") },
    { value: "none", label: t("filters.none") },
    { value: "line-only", label: t("filters.line_only") },
  ];

  return (
    <div className={isRTL ? "rtl" : ""}>
      {/* Modal Header */}
      <header className="modal-header">
        <div className="modal-drag-handle"></div>
        <div className="modal-title-row">
          <div className="modal-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 -960 960 960"
              width="20px"
              height="20px"
              fill="white"
            >
              <path d="M400-240v-80h160v80H400ZM240-440v-80h480v80H240ZM120-640v-80h720v80H120Z" />
            </svg>
          </div>
          <h2 className="modal-title">{t("filters.title")}</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onApply}
            aria-label={t("filters.close")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="#0c4a6e"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Modal Body */}
      <div className="modal-body">
        {/* Lines Filter */}
        <div className="form-group">
          <div className="form-label">
            <div
              className="label-icon"
              style={{
                background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                enableBackground="new 0 0 24 24"
                height="16px"
                viewBox="0 0 24 24"
                width="16px"
                fill="white"
              >
                <g>
                  <rect fill="none" height="24" width="24" />
                </g>
                <g>
                  <g>
                    <path d="M19,15.18V7c0-2.21-1.79-4-4-4s-4,1.79-4,4v10c0,1.1-0.9,2-2,2s-2-0.9-2-2V8.82C8.16,8.4,9,7.3,9,6c0-1.66-1.34-3-3-3 S3,4.34,3,6c0,1.3,0.84,2.4,2,2.82V17c0,2.21,1.79,4,4,4s4-1.79,4-4V7c0-1.1,0.9-2,2-2s2,0.9,2,2v8.18c-1.16,0.41-2,1.51-2,2.82 c0,1.66,1.34,3,3,3s3-1.34,3-3C21,16.7,20.16,15.6,19,15.18z" />
                  </g>
                </g>
              </svg>
            </div>
            <span>{t("filters.lines")}</span>
          </div>
          <Select
            isMulti
            options={lines}
            value={selectedFilters.line}
            onChange={(value) => handleChange("line", value)}
            isSearchable={false}
            styles={multiSelectStyles}
          />
        </div>

        {/* Stops Filter */}
        <div className="form-group">
          <div className="form-label">
            <div
              className="label-icon"
              style={{
                background: "linear-gradient(135deg, #eab308 0%, #fbbf24 100%)",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M20 3V12C20 12.71 19.62 13.36 19 13.72V15.25C19 15.66 18.66 16 18.25 16H17.75C17.34 16 17 15.66 17 15.25V14H10V15.25C10 15.66 9.66 16 9.25 16H8.75C8.34 16 8 15.66 8 15.25V13.72C7.39 13.36 7 12.71 7 12V3C7 0 10 0 13.5 0C17 0 20 0 20 3Z"
                  fill="white"
                />
              </svg>
            </div>
            <span>{t("filters.stops")}</span>
          </div>
          <Select
            options={stopFilters}
            value={selectedFilters.stop}
            onChange={(value: SingleValue<{ label: string; value: string }>) =>
              handleChange("stop", value)
            }
            isSearchable={false}
            styles={singleSelectStyles}
          />
        </div>

        {/* Buses Filter */}
        <div className="form-group">
          <div className="form-label">
            <div
              className="label-icon"
              style={{
                background: "linear-gradient(135deg, #d946ef 0%, #f0abfc 100%)",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 576 512"
                width="18"
                height="18"
                fill="white"
              >
                <path d="M288 0C422.4 0 512 35.2 512 80l0 16 0 32c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32l0 160c0 17.7-14.3 32-32 32l0 32c0 17.7-14.3 32-32 32l-32 0c-17.7 0-32-14.3-32-32l0-32-192 0 0 32c0 17.7-14.3 32-32 32l-32 0c-17.7 0-32-14.3-32-32l0-32c-17.7 0-32-14.3-32-32l0-160c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32c0 0 0 0 0 0l0-32s0 0 0 0l0-16C64 35.2 153.6 0 288 0z" />
              </svg>
            </div>
            <span>{t("filters.buses")}</span>
          </div>
          <Select
            options={busFilters}
            value={selectedFilters.bus}
            onChange={(value: SingleValue<{ label: string; value: string }>) =>
              handleChange("bus", value)
            }
            isSearchable={false}
            styles={singleSelectStyles}
          />
        </div>

        {/* Map Layer Filter — a basemap choice matters to whoever is building
            or debugging the map, not to a rider looking for their bus, so it
            sits collapsed under the filters that do. */}
        <details className="advanced-group">
          <summary className="advanced-summary">
            <span>{t("filters.map_layer")}</span>
            <svg
              className="advanced-chevron"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>

          <div className="form-group advanced-body">
            <div className="form-label">
              <div
                className="label-icon"
                style={{
                  background:
                    "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="white"
                >
                  <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z" />
                </svg>
              </div>
              <span>{t("filters.map_layer")}</span>
            </div>
            <Select
              options={LEAFLET_PROVIDERS.map((provider) => ({
                label: provider.name,
                value: provider.id.toString(),
              }))}
              value={{
                label: currentLeafletProvider.name,
                value: currentLeafletProvider.id.toString(),
              }}
              onChange={(
                value: SingleValue<{ label: string; value: string }>,
              ) => {
                const provider = LEAFLET_PROVIDERS.find(
                  (provider) => provider.id === Number(value?.value),
                );
                if (provider) {
                  setLeafletProvider(provider);
                }
              }}
              isSearchable={false}
              styles={singleSelectStyles}
            />
          </div>
        </details>

        {/* Apply Button */}
        <button
          type="button"
          className="primary-button"
          onClick={applyFilters}
          style={{ width: "100%" }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{t("filters.apply")}</span>
        </button>
      </div>
    </div>
  );
}
