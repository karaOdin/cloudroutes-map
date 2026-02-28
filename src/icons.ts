import L from "leaflet";
import busStop from "./assets/bus-stop.svg";

export const busStopIcon = new L.Icon({
  iconUrl: busStop,
  iconRetinaUrl: busStop,
  iconSize: new L.Point(16, 16),
});

export const busIcon = (angle: number) =>
  L.divIcon({
    className: "bus-icon",
    html: `<div class="bus-icon-container">
          <div class="bus-direction" style="--angle: ${angle}deg;">
            <svg width="37" height="46" viewBox="0 0 37 46" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="18.5" cy="27.5" r="18" fill="white" stroke="#06b6d4"/>
              <path d="M18 17C23.25 17 26.75 18.375 26.75 20.125V20.75V22C27.4414 22 28 22.5586 28 23.25V25.75C28 26.4414 27.4414 27 26.75 27V33.25C26.75 33.9414 26.1914 34.5 25.5 34.5V35.75C25.5 36.4414 24.9414 37 24.25 37H23C22.3086 37 21.75 36.4414 21.75 35.75V34.5H14.25V35.75C14.25 36.4414 13.6914 37 13 37H11.75C11.0586 37 10.5 36.4414 10.5 35.75V34.5C9.80859 34.5 9.25 33.9414 9.25 33.25V27C8.55859 27 8 26.4414 8 25.75V23.25C8 22.5586 8.55859 22 9.25 22V20.75V20.125C9.25 18.375 12.75 17 18 17ZM11.75 23.25V27C11.75 27.6914 12.3086 28.25 13 28.25H17.375V22H13C12.3086 22 11.75 22.5586 11.75 23.25ZM18.625 28.25H23C23.6914 28.25 24.25 27.6914 24.25 27V23.25C24.25 22.5586 23.6914 22 23 22H18.625V28.25ZM12.375 32.625C12.7065 32.625 13.0245 32.4933 13.2589 32.2589C13.4933 32.0245 13.625 31.7065 13.625 31.375C13.625 31.0435 13.4933 30.7255 13.2589 30.4911C13.0245 30.2567 12.7065 30.125 12.375 30.125C12.0435 30.125 11.7255 30.2567 11.4911 30.4911C11.2567 30.7255 11.125 31.0435 11.125 31.375C11.125 31.7065 11.2567 32.0245 11.4911 32.2589C11.7255 32.4933 12.0435 32.625 12.375 32.625ZM23.625 32.625C23.9565 32.625 24.2745 32.4933 24.5089 32.2589C24.7433 32.0245 24.875 31.7065 24.875 31.375C24.875 31.0435 24.7433 30.7255 24.5089 30.4911C24.2745 30.2567 23.9565 30.125 23.625 30.125C23.2935 30.125 22.9755 30.2567 22.7411 30.4911C22.5067 30.7255 22.375 31.0435 22.375 31.375C22.375 31.7065 22.5067 32.0245 22.7411 32.2589C22.9755 32.4933 23.2935 32.625 23.625 32.625ZM21.75 20.125C21.75 19.7812 21.4688 19.5 21.125 19.5H14.875C14.5312 19.5 14.25 19.7812 14.25 20.125C14.25 20.4688 14.5312 20.75 14.875 20.75H21.125C21.4688 20.75 21.75 20.4688 21.75 20.125Z" fill="#06b6d4"/>
              <path d="M18.5 4L16 8L18.5 7.33333L21 8L18.5 4Z" stroke="#06b6d4" stroke-width="4"/>
            </svg>
          </div>
         </div>
      `,
    iconSize: new L.Point(37, 46),
    iconAnchor: [37 / 2, 46 * 1.2],
  });

export const userIcon = () => {
  return L.divIcon({
    className: "bus-icon",
    html: `
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Main circle -->
        <circle cx="24" cy="24" r="20" fill="url(#userGradient)"/>
        
        <!-- Inner white circle -->
        <circle cx="24" cy="24" r="16" fill="white"/>
        
        <!-- Location dot -->
        <circle cx="24" cy="24" r="7" fill="url(#userGradient)"/>
        
        <!-- Direction arrow -->
        <path d="M30.0641 31.7983C30.6395 31.9901 31.1749 31.4184 30.9457 30.8567L24.6573 15.4417C24.417 14.8528 23.583 14.8528 23.3427 15.4417L17.0543 30.8567C16.8251 31.4184 17.3605 31.9901 17.936 31.7983L23.7755 29.8517C23.9212 29.8032 24.0788 29.8032 24.2245 29.8517L30.0641 31.7983Z" fill="white"/>
        
        <!-- Pulse animation circle -->
        <circle cx="24" cy="24" r="20" fill="none" stroke="url(#userGradient)" stroke-width="2" opacity="0.5">
          <animate attributeName="r" from="20" to="26" dur="1.5s" repeatCount="indefinite"/>
          <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite"/>
        </circle>
        
        <defs>
          <linearGradient id="userGradient" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#10b981"/>
            <stop offset="100%" stop-color="#06b6d4"/>
          </linearGradient>
        </defs>
      </svg>
    `,
    iconSize: new L.Point(48, 48),
    iconAnchor: [24, 24],
    popupAnchor: [0, -24],
  });
};
